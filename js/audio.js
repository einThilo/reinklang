import { INSTRUMENTS } from "./instruments.js";

// Prototypen K0.1 (siehe docs/PROTOTYPEN.md): Schalter über die Adresse, um das Knacken einzugrenzen.
const urlParams = new URLSearchParams(window.location.search);
const BYPASS_COMPRESSOR = urlParams.get("kompressor") === "aus";
const SINGLE_OSCILLATOR = urlParams.get("teiltoene") === "1";
// Prototyp K0.2: `?vorlauf=<Millisekunden>` legt Anschlag und Loslassen um diesen Betrag in die Zukunft.
const LOOKAHEAD = Math.max(0, Number(urlParams.get("vorlauf")) || 0) / 1000;
// Prototyp K3.1: `?welle=1` gibt jedem Ton einen einzigen Oszillator mit berechneter Wellenform.
const USE_PERIODIC_WAVE = urlParams.get("welle") === "1";
const MAX_HARMONIC = 128;

// Stärken der harmonischen Teiltöne eines Tons (Index = Nummer des Teiltons, 0 bleibt leer).
// Sinus-Reihen tragen je Teilton einen Wert bei; Dreieck-Reihen werden in ihre eigenen
// ungeraden Teiltöne zerlegt (Stärke 8/π²/k², Vorzeichen wechselnd).
export function harmonicAmplitudes(instrument, baseFreq, nyquist, interpolate) {
  const amplitudes = new Float32Array(MAX_HARMONIC + 1);
  const add = (harmonic, amplitude) => {
    if (harmonic <= MAX_HARMONIC && harmonic * baseFreq < nyquist) amplitudes[harmonic] += amplitude;
  };

  for (const series of instrument.partialSeries) {
    const maxGain = interpolate(baseFreq, series.gainKeyframes);
    const falloff = interpolate(baseFreq, series.falloffKeyframes);

    for (let p = series.fromPartial; p <= series.untilPartial; p++) {
      const partialGain = maxGain * Math.pow(1 - falloff, p - series.fromPartial);

      if (series.type === "triangle") {
        for (let k = 1; p * k <= MAX_HARMONIC; k += 2) {
          const sign = ((k - 1) / 2) % 2 === 0 ? 1 : -1;
          add(p * k, partialGain * sign * 8 / (Math.PI * Math.PI * k * k));
        }
      } else {
        add(p, partialGain);
      }
    }
  }

  return amplitudes;
}

// Prototyp K0.3: `?huellkurve=neu` berechnet die Lautstärke statt sie zu lesen und plant einen
// abgebrochenen Verlauf lückenlos neu.
const NEW_ENVELOPE = urlParams.get("huellkurve") === "neu";
// Prototyp K0.4: `?anschlag=linear` lässt die Lautstärke im Anschlag gleichmäßig statt zum Ende hin steil steigen.
const LINEAR_ATTACK = urlParams.get("anschlag") === "linear";

// Lautstärke einer Stimme zum Zeitpunkt t. In der Vorgabe wie bisher der gelesene Wert; mit Vorlauf
// oder neuer Hüllkurve aus dem geplanten Verlauf berechnet.
function gainAt(voice, t) {
  const env = voice.envelope;
  if (!env || (LOOKAHEAD === 0 && !NEW_ENVELOPE)) return Math.max(voice.gain.gain.value, 0.001);

  const sinceStart = t - env.startTime;
  if (sinceStart <= 0) return env.startGain;
  if (sinceStart < env.attackTime) {
    const progress = sinceStart / env.attackTime;
    if (env.linearAttack) return env.startGain + (1 - env.startGain) * progress;
    return env.startGain * Math.pow(1 / env.startGain, progress);
  }
  const sinceAttack = sinceStart - env.attackTime;
  if (sinceAttack < env.decayTime) return Math.pow(env.sustainGain, sinceAttack / env.decayTime);
  return env.sustainGain;
}

// Löscht die ab t geplanten Verläufe und legt die Lautstärke `current` als Startpunkt bei t fest.
// Das Löschen entfernt auch einen gerade laufenden Verlauf ganz; die Lautstärke fiele dann bis t auf
// den Wert davor zurück. Die neue Hüllkurve plant ihn deshalb bis t neu: Ein Verlauf vom letzten
// Stützpunkt zum berechneten Wert bei t folgt genau der bisherigen Kurve.
function anchorGain(voice, current, t) {
  const g = voice.gain.gain;
  g.cancelScheduledValues(t);
  const env = voice.envelope;
  if (NEW_ENVELOPE && env) {
    if (env.linearAttack && t - env.startTime < env.attackTime) {
      g.linearRampToValueAtTime(current, t);
    } else {
      g.exponentialRampToValueAtTime(current, t);
    }
  } else {
    g.setValueAtTime(current, t);
  }
}

export class AudioEngine {
  constructor(instrumentKey) {
    this.ctx = null;
    this.master = null;

    this.instruments = INSTRUMENTS;
    this.currentInstrument = instrumentKey;

    this.voices = new Map();
    this.waves = new Map();
  }

  ensureStarted() {
    if (!this.ctx) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextCtor();

      this.master = this.ctx.createGain();
      this.master.gain.value = BYPASS_COMPRESSOR ? 0.1 : 0.3;

      if (BYPASS_COMPRESSOR) {
        this.master.connect(this.ctx.destination);
      } else {
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -24.0;
        this.limiter.knee.value = 30.0;
        this.limiter.ratio.value = 20.0;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.05;

        this.master.connect(this.limiter);
        this.limiter.connect(this.ctx.destination);
      }
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  interpolateKeyframes(freq, keyframes) {
    const freqs = Object.keys(keyframes).map(Number).sort((a, b) => a - b);
    
    if (freqs.length === 0) return 0;
    if (freq <= freqs[0]) return keyframes[freqs[0]];
    if (freq >= freqs[freqs.length - 1]) return keyframes[freqs[freqs.length - 1]];

    for (let i = 0; i < freqs.length - 1; i++) {
      if (freq >= freqs[i] && freq <= freqs[i + 1]) {
        const low = freqs[i];
        const high = freqs[i + 1];
        const ratio = (freq - low) / (high - low);
        return keyframes[low] + (keyframes[high] - keyframes[low]) * ratio;
      }
    }
    
    return 0;
  }

  setInstrument(instrumentKey) {
    if (!this.instruments[instrumentKey]) return;
    this.currentInstrument = instrumentKey;
    this.rebuildAllVoices();
  }

  getPartialFrequency(baseFreq, series, p) {
    return baseFreq + baseFreq * series.proportion * (p - 1);
  }

  // Wellenform für Instrument und Taste; einmal berechnet und dann wiederverwendet.
  getWave(midi, baseFreq) {
    const key = `${this.currentInstrument}:${midi}`;
    let wave = this.waves.get(key);
    if (!wave) {
      const sines = harmonicAmplitudes(
        this.instruments[this.currentInstrument],
        baseFreq,
        this.ctx.sampleRate / 2,
        this.interpolateKeyframes
      );
      const cosines = new Float32Array(sines.length);
      wave = this.ctx.createPeriodicWave(cosines, sines, { disableNormalization: true });
      this.waves.set(key, wave);
    }
    return wave;
  }

  createVoice(midi, baseFreq, t) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    if (USE_PERIODIC_WAVE) {
      const osc = this.ctx.createOscillator();
      osc.setPeriodicWave(this.getWave(midi, baseFreq));
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.connect(gain);
      osc.start(t);
      return { midi, baseFrequency: baseFreq, oscillators: [{ osc }], gain, singleOscillator: true };
    }

    const nyquist = this.ctx.sampleRate / 2;
    const oscillators = [];
    const instrument = this.instruments[this.currentInstrument];

    for (let s = 0; s < instrument.partialSeries.length; s++) {
      const series = instrument.partialSeries[s];
      const currentSeriesMaxGain = this.interpolateKeyframes(baseFreq, series.gainKeyframes);
      const currentSeriesFalloff = this.interpolateKeyframes(baseFreq, series.falloffKeyframes);

      for (let p = series.fromPartial; p <= series.untilPartial; p++) {
        const partialFreq = this.getPartialFrequency(baseFreq, series, p);
        if (partialFreq >= nyquist) continue;
        if (SINGLE_OSCILLATOR && oscillators.length > 0) continue;

        const step = p - series.fromPartial;
        const partialGain = currentSeriesMaxGain * Math.pow(1 - currentSeriesFalloff, step);

        const osc = this.ctx.createOscillator();
        const partialGainNode = this.ctx.createGain();

        osc.type = series.type;
        osc.frequency.setValueAtTime(partialFreq, t);
        partialGainNode.gain.setValueAtTime(partialGain, t);

        osc.connect(partialGainNode);
        partialGainNode.connect(gain);

        osc.start(t);

        oscillators.push({ osc, gainNode: partialGainNode, seriesIndex: s, partialIndex: p });
      }
    }

    return { midi, baseFrequency: baseFreq, oscillators, gain };
  }

  retuneVoice(voice, baseFreq, t) {
    voice.baseFrequency = baseFreq;

    if (voice.singleOscillator) {
      voice.oscillators[0].osc.frequency.setTargetAtTime(baseFreq, t, 0.01);
      return;
    }

    const nyquist = this.ctx.sampleRate / 2;
    const instrument = this.instruments[this.currentInstrument];

    for (const item of voice.oscillators) {
      const series = instrument.partialSeries[item.seriesIndex];
      if (!series) continue;

      const newFreq = this.getPartialFrequency(baseFreq, series, item.partialIndex);
      if (newFreq >= nyquist) continue;

      item.osc.frequency.setTargetAtTime(newFreq, t, 0.01);
    }
  }

  retuneAllVoices(frequencyOf) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [midi, voice] of this.voices) {
      const baseFreq = frequencyOf(midi);
      this.retuneVoice(voice, baseFreq, t);
    }
  }

  rebuildAllVoices() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const activeMidis = Array.from(this.voices.keys());

    for (const midi of activeMidis) {
      const oldVoice = this.voices.get(midi);
      if (!oldVoice) continue;

      const currentGain = gainAt(oldVoice, t);

      for (const item of oldVoice.oscillators) {
        item.osc.stop(t + 0.02);
      }

      const baseFreq = oldVoice.baseFrequency;
      const newVoice = this.createVoice(midi, baseFreq, t);
      newVoice.gain.gain.setValueAtTime(currentGain, t);
      // Die übernommene Lautstärke gilt als fester Wert.
      newVoice.envelope = { startTime: t, startGain: currentGain, attackTime: 0, decayTime: 0, sustainGain: currentGain };

      this.voices.set(midi, newVoice);
    }
  }

  noteOn(midi, frequency) {
    this.ensureStarted();

    const t = this.ctx.currentTime + LOOKAHEAD;
    const freq = frequency;
    let voice = this.voices.get(midi);

    if (!voice) {
      voice = this.createVoice(midi, freq, t);
      this.voices.set(midi, voice);
    } else {
      this.retuneVoice(voice, freq, t);
    }

    const instrument = this.instruments[this.currentInstrument];
    const g = voice.gain.gain;
    const current = gainAt(voice, t);
    const sustainGain = Math.max(instrument.sustainGain, 0.001);

    anchorGain(voice, current, t);
    if (LINEAR_ATTACK) {
      g.linearRampToValueAtTime(1, t + instrument.attackTime);
    } else {
      g.exponentialRampToValueAtTime(1, t + instrument.attackTime);
    }
    g.exponentialRampToValueAtTime(sustainGain, t + instrument.attackTime + instrument.decayTime);

    voice.envelope = {
      startTime: t,
      startGain: current,
      attackTime: instrument.attackTime,
      decayTime: instrument.decayTime,
      sustainGain,
      linearAttack: LINEAR_ATTACK
    };
  }

  noteOff(midi) {
    const voice = this.voices.get(midi);
    if (!voice) return;

    const t = this.ctx.currentTime + LOOKAHEAD;
    const instrument = this.instruments[this.currentInstrument];
    const g = voice.gain.gain;
    const current = gainAt(voice, t);

    anchorGain(voice, current, t);
    g.exponentialRampToValueAtTime(0.001, t + instrument.releaseTime);

    for (const item of voice.oscillators) {
      item.osc.stop(t + instrument.releaseTime + 0.02);
    }

    this.voices.delete(midi);
  }
}
