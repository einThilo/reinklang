import { INSTRUMENTS } from "./instruments.js";

export class AudioEngine {
  constructor(instrumentKey) {
    this.ctx = null;
    this.master = null;

    this.instruments = INSTRUMENTS;
    this.currentInstrument = instrumentKey;

    this.voices = new Map();
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

  createVoice(midi, baseFreq, t) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

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

        const step = p - series.fromPartial;
        const partialGain = currentSeriesMaxGain * Math.pow(1 - currentSeriesFalloff, step);

        const osc = this.ctx.createOscillator();
        const partialGainNode = this.ctx.createGain();

        osc.type = series.type;
        osc.frequency.setValueAtTime(partialFreq, t);
        partialGainNode.gain.setValueAtTime(partialGain, t);

        osc.connect(partialGainNode);
        partialGainNode.connect(gain);

        osc.start();

        oscillators.push({ osc, gainNode: partialGainNode, seriesIndex: s, partialIndex: p });
      }
    }

    return { midi, baseFrequency: baseFreq, oscillators, gain };
  }

  retuneVoice(voice, baseFreq, t) {
    voice.baseFrequency = baseFreq;
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

      const currentGain = Math.max(oldVoice.gain.gain.value, 0.001);

      for (const item of oldVoice.oscillators) {
        item.osc.stop(t + 0.02);
      }

      const baseFreq = oldVoice.baseFrequency;
      const newVoice = this.createVoice(midi, baseFreq, t);
      newVoice.gain.gain.setValueAtTime(currentGain, t);

      this.voices.set(midi, newVoice);
    }
  }

  noteOn(midi, frequency) {
    this.ensureStarted();

    const t = this.ctx.currentTime;
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
    const current = Math.max(g.value, 0.001);

    g.cancelScheduledValues(t);
    g.setValueAtTime(current, t);
    g.exponentialRampToValueAtTime(1, t + instrument.attackTime);
    g.exponentialRampToValueAtTime(
      Math.max(instrument.sustainGain, 0.001),
      t + instrument.attackTime + instrument.decayTime
    );
  }

  noteOff(midi) {
    const voice = this.voices.get(midi);
    if (!voice) return;

    const t = this.ctx.currentTime;
    const instrument = this.instruments[this.currentInstrument];
    const g = voice.gain.gain;
    const current = Math.max(g.value, 0.001);

    g.cancelScheduledValues(t);
    g.setValueAtTime(current, t);
    g.exponentialRampToValueAtTime(0.001, t + instrument.releaseTime);

    for (const item of voice.oscillators) {
      item.osc.stop(t + instrument.releaseTime + 0.02);
    }

    this.voices.delete(midi);
  }
}
