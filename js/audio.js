import { INSTRUMENTS } from "./instruments.js";

const MAX_HARMONIC = 128;
const MIN_GAIN = 0.001;
const MASTER_GAIN = 0.3;

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

// Prototyp K8 (`?laut=bass|beides`): Kleine Lautsprecher geben tiefe Grundtöne kaum wieder. Bei tiefen
// Tönen werden deshalb die Teiltöne zwischen 150 und 2000 Hz verstärkt, die das Ohr hört und aus denen es
// den Grundton ergänzt. Der Grundton selbst und Töne ab 350 Hz bleiben, wie sie sind; alles bleibt
// harmonisch. Faktor bis 3 bei 65 Hz und tiefer, darüber abnehmend.
export function bassBoost(amplitudes, baseFreq) {
  const weight = Math.min(Math.max((350 - baseFreq) / (350 - 65), 0), 1);
  if (weight === 0) return amplitudes;
  for (let k = 2; k < amplitudes.length; k++) {
    const freq = k * baseFreq;
    if (freq >= 150 && freq <= 2000) amplitudes[k] *= 1 + 2 * weight;
  }
  return amplitudes;
}

// Lautstärke einer Stimme zum Zeitpunkt t, berechnet aus dem geplanten Verlauf:
// linearer Anschlag auf 1, dann exponentielles Abklingen auf die Haltelautstärke;
// nach dem Loslassen exponentieller Ausklang auf MIN_GAIN.
// Der Wert wird nicht aus dem Browser gelesen, weil der gelesene Wert der Klangberechnung nachläuft.
function gainAt(voice, t) {
  const env = voice.envelope;
  if (!env) return MIN_GAIN;

  if (env.release) {
    const r = env.release;
    if (t <= r.startTime) return r.startGain;
    if (t >= r.endTime) return MIN_GAIN;
    return r.startGain * Math.pow(MIN_GAIN / r.startGain, (t - r.startTime) / (r.endTime - r.startTime));
  }

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
  } else if (!env.release && t - env.startTime < env.attackTime) {
    g.linearRampToValueAtTime(current, t);
  } else {
    g.exponentialRampToValueAtTime(current, t);
  }
}

// Plätze je Taste (K6): die Haltestimme und eine zusätzliche Spielstimme.
export const PLAETZE = ["halte", "spiel"];

// Z13: Unter iOS schaltet der Stummschalter Web Audio sonst stumm; „playback“ gilt wie bei Musik-Apps.
// Ab iOS 17; Browser ohne `navigator.audioSession` überspringen das. Vor dem AudioContext setzen.
export function preferPlayback(nav = globalThis.navigator) {
  if (nav?.audioSession) nav.audioSession.type = "playback";
}

export class AudioEngine {
  // `loudness`: Prototyp K8 (`?laut=pegel|bass|beides`), sonst null.
  constructor(instrumentKey, { loudness = null } = {}) {
    this.ctx = null;
    this.master = null;
    this.loudness = loudness;
    const louder = loudness === "pegel" || loudness === "beides";
    this.masterGain = louder ? 0.6 : MASTER_GAIN;
    this.boostBass = loudness === "bass" || loudness === "beides";

    this.instruments = INSTRUMENTS;
    this.currentInstrument = instrumentKey;

    // Taste → { halte, spiel }. Eine Stimme bleibt auch während ihres Ausklangs auf ihrem Platz,
    // damit erneutes Drücken sie neu anschlagen kann.
    this.voices = new Map();
    this.waves = new Map();

    // Zeitgeber zum Beenden ausgeklungener Stimmen; in Tests ersetzbar.
    this.schedule = (fn, ms) => setTimeout(fn, ms);
  }

  ensureStarted() {
    if (!this.ctx) {
      preferPlayback();
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextCtor();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterGain;

      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -24.0;
      this.limiter.knee.value = 30.0;
      this.limiter.ratio.value = 20.0;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.05;
      if (this.masterGain !== MASTER_GAIN) {
        // K8 `pegel`: doppelter Pegel; der Kompressor greift später, aber härter, damit nichts übersteuert.
        this.limiter.threshold.value = -12.0;
        this.limiter.knee.value = 6.0;
        this.limiter.attack.value = 0.002;
        this.limiter.release.value = 0.1;
      }

      this.master.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
    }

    // Ein Anschlag während `silence` bricht das Anhalten ab (S19).
    if (this.silencing) {
      this.silencing = null;
      this.restoreMaster();
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  restoreMaster() {
    const g = this.master.gain;
    g.cancelScheduledValues(0);
    g.value = this.masterGain;
    g.setValueAtTime(this.masterGain, this.ctx.currentTime);
  }

  // S19 (Seite verborgen): blendet in 50 ms aus, beendet danach alle Stimmen sofort und hält die
  // Klangerzeugung an, damit nichts weiterspielt und keine Mediensteuerung bleibt. Der nächste Anschlag
  // (`ensureStarted`) setzt sie fort.
  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.05);

    const token = {};
    this.silencing = token;
    this.schedule(() => {
      if (this.silencing !== token) return;
      this.silencing = null;
      for (const slots of this.voices.values()) {
        for (const platz of PLAETZE) {
          const voice = slots[platz];
          if (!voice || voice.finished) continue;
          voice.finished = true;
          voice.osc.stop();
          voice.gain.disconnect();
        }
      }
      this.voices.clear();
      this.restoreMaster();
      this.ctx.suspend();
    }, 80);
  }

  // Wirkt nur auf neue Stimmen; klingende behalten ihr Instrument (K6).
  setInstrument(instrumentKey) {
    if (!this.instruments[instrumentKey]) return;
    this.currentInstrument = instrumentKey;
  }

  // Die Stimme auf einem Platz einer Taste, auch während ihres Ausklangs; sonst undefined.
  voiceAt(midi, platz = "halte") {
    return this.voices.get(midi)?.[platz];
  }

  // Wellenform für Instrument und Tonhöhe; einmal berechnet und dann wiederverwendet.
  // Gemerkt wird auf den Halbton genau (bezogen auf 440 Hz): Die Teilton-Stärken hängen von der
  // Frequenz ab, und die Frequenz einer Taste ändert sich mit Stimmton und Grundton.
  getWave(instrumentKey, baseFreq) {
    const key = `${instrumentKey}:${Math.round(12 * Math.log2(baseFreq / 440))}`;
    let wave = this.waves.get(key);
    if (!wave) {
      const instrument = this.instruments[instrumentKey];
      const sines = harmonicAmplitudes(instrument, baseFreq, this.ctx.sampleRate / 2);
      if (this.boostBass) bassBoost(sines, baseFreq);
      const cosines = new Float32Array(sines.length);
      wave = this.ctx.createPeriodicWave(cosines, sines, { disableNormalization: true });
      this.waves.set(key, wave);
    }
    return wave;
  }

  // Eine Stimme ist ein Oszillator mit der Wellenform ihres Instruments und ein Lautstärkeregler.
  // `releaseEnd`: Ende des laufenden Ausklangs, null solange die Stimme nicht ausklingt.
  createVoice(midi, baseFreq, t) {
    const instrumentKey = this.currentInstrument;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.getWave(instrumentKey, baseFreq));
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.connect(gain);
    osc.start(t);

    return { midi, instrumentKey, baseFrequency: baseFreq, osc, gain, envelope: null, releaseEnd: null };
  }

  retuneVoice(voice, baseFreq, t) {
    voice.baseFrequency = baseFreq;
    voice.osc.frequency.setTargetAtTime(baseFreq, t, 0.01);
  }

  // Stimmt die klingenden Stimmen um; ausklingende behalten ihre Tonhöhe.
  retuneAllVoices(frequencyOf) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [midi, slots] of this.voices) {
      for (const platz of PLAETZE) {
        const voice = slots[platz];
        if (voice && voice.releaseEnd === null) this.retuneVoice(voice, frequencyOf(midi), t);
      }
    }
  }

  // Schlägt die Stimme auf dem Platz an. Eine klingende Stimme wird neu angeschlagen (behält ihr
  // Instrument), eine ausklingende ebenso, falls ihr Instrument noch das aktuelle ist. Sonst beginnt
  // eine neue Stimme; ein alter Ausklang läuft darunter zu Ende.
  noteOn(midi, frequency, platz = "halte") {
    this.ensureStarted();

    const t = this.ctx.currentTime;
    let slots = this.voices.get(midi);
    if (!slots) {
      slots = { halte: undefined, spiel: undefined };
      this.voices.set(midi, slots);
    }

    let voice = slots[platz];
    const reusable = voice && (voice.releaseEnd === null ||
      (t < voice.releaseEnd && voice.instrumentKey === this.currentInstrument));

    if (reusable) {
      voice.releaseEnd = null;
      this.retuneVoice(voice, frequency, t);
    } else {
      voice = this.createVoice(midi, frequency, t);
      slots[platz] = voice;
    }

    const instrument = this.instruments[voice.instrumentKey];
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

  // Lässt die Stimme auf dem Platz mit dem Ausklang ihres Instruments ausklingen. Sie bleibt bis zum
  // Ende des Ausklangs auf ihrem Platz und wird danach beendet, falls sie nicht neu angeschlagen wurde.
  noteOff(midi, platz = "halte") {
    const voice = this.voiceAt(midi, platz);
    if (!voice || voice.releaseEnd !== null) return;

    const t = this.ctx.currentTime;
    const instrument = this.instruments[voice.instrumentKey];
    const releaseEnd = t + instrument.releaseTime;

    const current = gainAt(voice, t);
    anchorGain(voice, current, t);
    voice.gain.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);
    voice.releaseEnd = releaseEnd;
    voice.envelope = { ...voice.envelope, release: { startTime: t, startGain: current, endTime: releaseEnd } };

    this.scheduleFinish(voice);
  }

  scheduleFinish(voice) {
    const remaining = Math.max(voice.releaseEnd - this.ctx.currentTime, 0);
    this.schedule(() => this.finishVoice(voice), (remaining + 0.05) * 1000);
  }

  // Regel 7 (K6): Die Spielstimme wird die Haltestimme; die bisherige Haltestimme klingt aus.
  promoteSpiel(midi) {
    const slots = this.voices.get(midi);
    if (!slots?.spiel) return;
    this.noteOff(midi, "halte");
    slots.halte = slots.spiel;
    slots.spiel = undefined;
  }

  // Beendet eine ausgeklungene Stimme. Wurde sie inzwischen neu angeschlagen, bleibt sie. Ist der
  // Ausklang noch nicht vorbei (erneut losgelassen, oder die Klangzeit läuft nach), wird später geprüft.
  finishVoice(voice) {
    if (voice.releaseEnd === null || voice.finished) return;
    if (this.ctx.currentTime < voice.releaseEnd) {
      this.scheduleFinish(voice);
      return;
    }
    voice.finished = true;
    voice.osc.stop();
    voice.gain.disconnect();

    const slots = this.voices.get(voice.midi);
    if (!slots) return;
    for (const platz of PLAETZE) {
      if (slots[platz] === voice) slots[platz] = undefined;
    }
    if (!slots.halte && !slots.spiel) this.voices.delete(voice.midi);
  }
}
