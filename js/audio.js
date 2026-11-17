import { INSTRUMENTS } from "./instruments.js";

const MAX_HARMONIC = 128;
const MIN_GAIN = 0.001;
// Dauer der Überblendung beim Instrumentwechsel mit `softSwitch` (Prototyp K2.1), in Sekunden.
const SWITCH_FADE_TIME = 0.03;

function interpolateKeyframes(freq, keyframes) {
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

// Stärken der harmonischen Teiltöne eines Tons (Index = Nummer des Teiltons, 0 bleibt leer).
// Sinus-Reihen tragen je Teilton einen Wert bei; Dreieck-Reihen werden in ihre eigenen
// ungeraden Teiltöne zerlegt (Stärke 8/π²/k², Vorzeichen wechselnd).
export function harmonicAmplitudes(instrument, baseFreq, nyquist) {
  const amplitudes = new Float32Array(MAX_HARMONIC + 1);
  const add = (harmonic, amplitude) => {
    if (harmonic <= MAX_HARMONIC && harmonic * baseFreq < nyquist) amplitudes[harmonic] += amplitude;
  };

  for (const series of instrument.partialSeries) {
    const maxGain = interpolateKeyframes(baseFreq, series.gainKeyframes);
    const falloff = interpolateKeyframes(baseFreq, series.falloffKeyframes);

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

// Lautstärke einer Stimme zum Zeitpunkt t, berechnet aus dem geplanten Verlauf:
// linearer Anschlag auf 1, dann exponentielles Abklingen auf die Haltelautstärke.
// Der Wert wird nicht aus dem Browser gelesen, weil der gelesene Wert der Klangberechnung nachläuft.
function gainAt(voice, t) {
  const env = voice.envelope;
  if (!env) return MIN_GAIN;

  const sinceStart = t - env.startTime;
  if (sinceStart <= 0) return env.startGain;
  if (sinceStart < env.attackTime) {
    return env.startGain + (1 - env.startGain) * sinceStart / env.attackTime;
  }
  const sinceAttack = sinceStart - env.attackTime;
  if (sinceAttack < env.decayTime) return Math.pow(env.sustainGain, sinceAttack / env.decayTime);
  return env.sustainGain;
}

// Löscht die ab t geplanten Verläufe und legt die Lautstärke `current` als Startpunkt bei t fest.
// Das Löschen entfernt auch einen gerade laufenden Verlauf ganz; die Lautstärke fiele dann bis t auf
// den Wert davor zurück (hörbar als Knacken). Deshalb wird er bis t neu geplant: Ein Verlauf vom
// letzten Stützpunkt zum berechneten Wert bei t folgt genau der bisherigen Kurve.
function anchorGain(voice, current, t) {
  const g = voice.gain.gain;
  const env = voice.envelope;

  g.cancelScheduledValues(t);
  if (!env) {
    g.setValueAtTime(current, t);
  } else if (t - env.startTime < env.attackTime) {
    g.linearRampToValueAtTime(current, t);
  } else {
    g.exponentialRampToValueAtTime(current, t);
  }
}

export class AudioEngine {
  // `softSwitch` (Prototyp K2.1, `?wechsel=weich`): Instrumentwechsel tauscht nur den Oszillator.
  constructor(instrumentKey, { softSwitch = false } = {}) {
    this.softSwitch = softSwitch;
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
      this.master.gain.value = 0.3;

      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -24.0;
      this.limiter.knee.value = 30.0;
      this.limiter.ratio.value = 20.0;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.05;

      this.master.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  setInstrument(instrumentKey) {
    if (!this.instruments[instrumentKey]) return;
    this.currentInstrument = instrumentKey;
    this.rebuildAllVoices();
  }

  // Wellenform für Instrument und Taste; einmal berechnet und dann wiederverwendet.
  getWave(midi, baseFreq) {
    const key = `${this.currentInstrument}:${midi}`;
    let wave = this.waves.get(key);
    if (!wave) {
      const instrument = this.instruments[this.currentInstrument];
      const sines = harmonicAmplitudes(instrument, baseFreq, this.ctx.sampleRate / 2);
      const cosines = new Float32Array(sines.length);
      wave = this.ctx.createPeriodicWave(cosines, sines, { disableNormalization: true });
      this.waves.set(key, wave);
    }
    return wave;
  }

  // Eine Stimme ist ein Oszillator mit der Wellenform des Instruments und ein Lautstärkeregler.
  createVoice(midi, baseFreq, t) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.getWave(midi, baseFreq));
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.connect(gain);
    osc.start(t);

    return { midi, baseFrequency: baseFreq, osc, gain, envelope: null };
  }

  retuneVoice(voice, baseFreq, t) {
    voice.baseFrequency = baseFreq;
    voice.osc.frequency.setTargetAtTime(baseFreq, t, 0.01);
  }

  retuneAllVoices(frequencyOf) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [midi, voice] of this.voices) {
      this.retuneVoice(voice, frequencyOf(midi), t);
    }
  }

  rebuildAllVoices() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    for (const [midi, oldVoice] of Array.from(this.voices)) {
      if (this.softSwitch) {
        this.swapOscillator(oldVoice, t);
        continue;
      }

      const currentGain = gainAt(oldVoice, t);
      oldVoice.osc.stop(t + 0.02);

      const newVoice = this.createVoice(midi, oldVoice.baseFrequency, t);
      newVoice.gain.gain.setValueAtTime(currentGain, t);
      // Die übernommene Lautstärke gilt als fester Wert.
      newVoice.envelope = { startTime: t, startGain: currentGain, attackTime: 0, decayTime: 0, sustainGain: currentGain };

      this.voices.set(midi, newVoice);
    }
  }

  // Prototyp K2.1: Der Lautstärkeregler der Stimme und sein Verlauf bleiben, der Ton klingt also
  // weiter ab. Nur der Oszillator wird getauscht: der alte wird über einen eigenen Regler aus-,
  // der neue eingeblendet.
  swapOscillator(voice, t) {
    const end = t + SWITCH_FADE_TIME;

    const fadeOut = this.ctx.createGain();
    fadeOut.gain.setValueAtTime(1, t);
    fadeOut.gain.linearRampToValueAtTime(0, end);
    voice.osc.disconnect();
    voice.osc.connect(fadeOut);
    fadeOut.connect(voice.gain);
    voice.osc.stop(end + 0.02);

    const fadeIn = this.ctx.createGain();
    fadeIn.gain.setValueAtTime(0, t);
    fadeIn.gain.linearRampToValueAtTime(1, end);
    fadeIn.connect(voice.gain);

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.getWave(voice.midi, voice.baseFrequency));
    osc.frequency.setValueAtTime(voice.baseFrequency, t);
    osc.connect(fadeIn);
    osc.start(t);

    voice.osc = osc;
  }

  noteOn(midi, frequency) {
    this.ensureStarted();

    const t = this.ctx.currentTime;
    let voice = this.voices.get(midi);

    if (!voice) {
      voice = this.createVoice(midi, frequency, t);
      this.voices.set(midi, voice);
    } else {
      this.retuneVoice(voice, frequency, t);
    }

    const instrument = this.instruments[this.currentInstrument];
    const g = voice.gain.gain;
    const current = gainAt(voice, t);
    const sustainGain = Math.max(instrument.sustainGain, MIN_GAIN);

    anchorGain(voice, current, t);
    g.linearRampToValueAtTime(1, t + instrument.attackTime);
    g.exponentialRampToValueAtTime(sustainGain, t + instrument.attackTime + instrument.decayTime);

    voice.envelope = {
      startTime: t,
      startGain: current,
      attackTime: instrument.attackTime,
      decayTime: instrument.decayTime,
      sustainGain
    };
  }

  noteOff(midi) {
    const voice = this.voices.get(midi);
    if (!voice) return;

    const t = this.ctx.currentTime;
    const instrument = this.instruments[this.currentInstrument];

    anchorGain(voice, gainAt(voice, t), t);
    voice.gain.gain.exponentialRampToValueAtTime(MIN_GAIN, t + instrument.releaseTime);
    voice.osc.stop(t + instrument.releaseTime + 0.02);

    this.voices.delete(midi);
  }
}
