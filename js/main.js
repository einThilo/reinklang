import { Keyboard, clamp } from "./keyboard.js";

document.addEventListener("DOMContentLoaded", init);


class KeyboardRangeController {
  constructor(keyboard, synth) {
    this.keyboard = keyboard;
    this.synth = synth;

    this.state = {
      startMidi: keyboard.startMidi,
      keyCount: keyboard.keyCount
    };
  }

  applyRange() {
    this.keyboard.setRange(this.state);
    this.synth.syncAllVisuals();
  }

  setStartMidi(startMidi) {
    const normalizedStart = clamp(Math.round(startMidi), 0, 127);
    const maxKeyCount = 128 - normalizedStart;

    this.state = {
      startMidi: normalizedStart,
      keyCount: clamp(Math.round(this.state.keyCount), 1, maxKeyCount)
    };

    this.applyRange();
  }

  setKeyCount(keyCount) {
    const normalizedStart = clamp(Math.round(this.state.startMidi), 0, 127);
    const maxKeyCount = 128 - normalizedStart;

    this.state = {
      startMidi: normalizedStart,
      keyCount: clamp(Math.round(keyCount), 1, maxKeyCount)
    };

    this.applyRange();
  }

  handleAction(action) {
    switch (action) {
      case "decKeys":
        this.setKeyCount(this.state.keyCount - 1);
        break;
      case "incKeys":
        this.setKeyCount(this.state.keyCount + 1);
        break;
      case "octDown":
        this.setStartMidi(this.state.startMidi - 12);
        break;
      case "semiDown":
        this.setStartMidi(this.state.startMidi - 1);
        break;
      case "semiUp":
        this.setStartMidi(this.state.startMidi + 1);
        break;
      case "octUp":
        this.setStartMidi(this.state.startMidi + 12);
        break;
    }
  }
}

/* ============================================================
   INSTRUMENTS & AUDIO ENGINE
   ============================================================ */

const INSTRUMENTS = {
  pad: {
    name: "Ambient Pad",
    attackTime: 0.15,
    decayTime: 0.3,
    sustainGain: 1,
    releaseTime: 1,
    partialSeries: [
      {
        type: "sine",
        fromPartial: 1,
        untilPartial: 6,
        proportion: 1,
        gainKeyframes: { 50: 0.4, 150: 0.5, 500: 0.6, 2000: 0.4 },
        falloffKeyframes: { 50: 0.2, 500: 0.4, 2000: 0.6 }
      },
      {
        type: "triangle",
        fromPartial: 1,
        untilPartial: 4,
        proportion: 1,
        gainKeyframes: { 50: 0.6, 150: 0.3, 400: 0.1, 800: 0.0 },
        falloffKeyframes: { 50: 0.4, 400: 0.6, 800: 0.8 }
      }
    ]
  },
  piano: {
    name: "Electric Piano",
    attackTime: 0.02,
    decayTime: 1.1,
    sustainGain: 0.1,
    releaseTime: 0.8,
    partialSeries: [
      {
        type: "sine",
        fromPartial: 1,
        untilPartial: 6,
        proportion: 1,
        gainKeyframes: { 50: 0.5, 200: 0.6, 1000: 0.5 },
        falloffKeyframes: { 50: 0.3, 500: 0.4 }
      },
      {
        type: "triangle",
        fromPartial: 1,
        untilPartial: 5,
        proportion: 1,
        gainKeyframes: { 50: 0.4, 200: 0.3, 600: 0.0 },
        falloffKeyframes: { 50: 0.5, 500: 0.7 }
      }
    ]
  }
};

const TUNINGS = {
  equal: {
    name: "Equal Temperament",
    ratios: null
  },
  just7Tri: {
    name: "Just 7 Tri",
    ratios: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8]
  },
  justHarmonicCarlos: {
    name: "Just Harmonic Carlos",
    ratios: [1, 17 / 16, 9 / 8, 19 / 16, 5 / 4, 21 / 16, 11 / 8, 3 / 2, 13 / 8, 27 / 16, 7 / 4, 15 / 8]
  },
  justSuperCarlos: {
    name: "Just Super Carlos",
    ratios: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 11 / 8, 3 / 2, 13 / 8, 5 / 3, 7 / 4, 15 / 8]
  },
  thilo: {
    name: "Thilo",
    ratios: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 7 / 4, 15 / 8]
  },
  liligetia: {
    name: "Liligetia",
    ratios: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 11 / 8, 7 / 5, 12 / 8, 8 / 5, 13 / 8, 7 / 4, 15 / 8]
  }
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;

    this.a4Frequency = 440;
    this.octaveRatio = 2;

    this.tuningMode = "thilo";
    this.tuningRootMidi = 60;
    
    this.instruments = INSTRUMENTS;
    this.currentInstrument = "piano";

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

  setA4Frequency(freq) {
    this.a4Frequency = freq;
    this.retuneAllVoices();
  }

  setOctaveRatio(ratio) {
    this.octaveRatio = ratio;
    this.retuneAllVoices();
  }

  setTuningMode(mode) {
    if (!TUNINGS[mode]) return;
    this.tuningMode = mode;
    this.retuneAllVoices();
  }

  setTuningRootMidi(midi) {
    const clamped = Math.max(0, Math.min(127, Math.round(midi)));
    this.tuningRootMidi = clamped;
    this.retuneAllVoices();
  }

  setInstrument(instrumentKey) {
    if (!this.instruments[instrumentKey]) return;
    this.currentInstrument = instrumentKey;
    this.rebuildAllVoices();
  }

  midiToFrequency(midi) {
    const tuning = TUNINGS[this.tuningMode];
    if (!tuning || !tuning.ratios) {
      return this.getEqualTemperamentFrequency(midi);
    }
    return this.getTunedFrequency(midi, tuning.ratios);
  }

  getEqualTemperamentFrequency(midi) {
    return this.a4Frequency * Math.pow(this.octaveRatio, (midi - 69) / 12);
  }

  getTunedFrequency(midi, ratios) {
    const diff = midi - this.tuningRootMidi;
    const degree = ((diff % 12) + 12) % 12;
    const octaveShift = Math.floor(diff / 12);
    const rootFreq = this.getEqualTemperamentFrequency(this.tuningRootMidi);
    return rootFreq * ratios[degree] * Math.pow(this.octaveRatio, octaveShift);
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

  retuneAllVoices() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [midi, voice] of this.voices) {
      const baseFreq = this.midiToFrequency(midi);
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

      const baseFreq = this.midiToFrequency(midi);
      const newVoice = this.createVoice(midi, baseFreq, t);
      newVoice.gain.gain.setValueAtTime(currentGain, t);

      this.voices.set(midi, newVoice);
    }
  }

  noteOn(midi) {
    this.ensureStarted();

    const t = this.ctx.currentTime;
    const freq = this.midiToFrequency(midi);
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

/* ============================================================
   SYNTH CONTROLLER
   ============================================================ */

class SynthController {
  constructor(keyboard, audioEngine) {
    this.keyboard = keyboard;
    this.audioEngine = audioEngine;

    this.physicalPresses = new Array(128).fill(0);
    this.isHeld = new Array(128).fill(false);
    this.isSounding = new Array(128).fill(false);
    this.sustainEnabled = false;
    
    this.activeNotes = new Set();
    this.onNotesChanged = () => {};
  }

  setSustainEnabled(enabled) {
    this.sustainEnabled = enabled;
  }

  releaseAllHeldKeys() {
    let changed = false;
    for (let midi = 0; midi < 128; midi++) {
      if (this.isHeld[midi]) {
        this.isHeld[midi] = false;
        if (this.evaluateNoteStateInternal(midi)) changed = true;
        this.updateKeyboardVisuals(midi);
      }
    }
    if (changed) this.onNotesChanged();
  }

  handlePointerEvent(type, midi) {
    if (type === "down") {
      if (this.sustainEnabled) {
        this.isHeld[midi] = !this.isHeld[midi];
      } else {
        this.physicalPresses[midi]++;
      }
      this.evaluateNoteState(midi, true);
      this.updateKeyboardVisuals(midi);
    } else if (type === "up") {
      if (this.physicalPresses[midi] > 0) {
        this.physicalPresses[midi]--;
      }
      this.evaluateNoteState(midi, false);
      this.updateKeyboardVisuals(midi);
    }
  }

  evaluateNoteState(midi, forceTrigger = false) {
    if (this.evaluateNoteStateInternal(midi, forceTrigger)) {
      this.onNotesChanged();
    }
  }

  evaluateNoteStateInternal(midi, forceTrigger = false) {
    let changed = false;
    const shouldSound = this.physicalPresses[midi] > 0 || this.isHeld[midi];
    
    if (shouldSound) {
      if (!this.isSounding[midi] || forceTrigger) {
        this.isSounding[midi] = true;
        this.activeNotes.add(midi);
        this.audioEngine.noteOn(midi);
        changed = true;
      }
    } else if (this.isSounding[midi]) {
      this.isSounding[midi] = false;
      this.activeNotes.delete(midi);
      this.audioEngine.noteOff(midi);
      changed = true;
    }
    
    return changed;
  }

  updateKeyboardVisuals(midi) {
    this.keyboard.setHeldState(midi, this.isHeld[midi]);
    this.keyboard.setActiveState(midi, this.physicalPresses[midi] > 0);
  }

  syncAllVisuals() {
    for (let midi = 0; midi < 128; midi++) {
      this.updateKeyboardVisuals(midi);
    }
  }

  stopAllNotes() {
    let changed = false;
    for (let midi = 0; midi < 128; midi++) {
      this.physicalPresses[midi] = 0;
      this.isHeld[midi] = false;
      if (this.evaluateNoteStateInternal(midi)) changed = true;
      this.updateKeyboardVisuals(midi);
    }
    if (changed) this.onNotesChanged();
  }
}

/* ============================================================
   UI BUILDERS
   ============================================================ */

/* ============================================================
   APP INITIALIZATION
   ============================================================ */

function init() {
  const mainKeyboardContainer = document.getElementById("keyboard");
  const harmonyKeyboardContainer = document.getElementById("harmony-keyboard");
  
  const appRoot = document.querySelector(".column");
  const fullscreenButton = document.getElementById("fullscreen-toggle");

  const mainKeyboard = new Keyboard({
    container: mainKeyboardContainer,
    startMidi: 45,
    keyCount: 26,
    id: "main"
  });

  const harmonyKeyboard = new Keyboard({
    container: harmonyKeyboardContainer,
    startMidi: 60,
    keyCount: 12,
    id: "harmony"
  });

  const audioEngine = new AudioEngine();
  const synth = new SynthController(mainKeyboard, audioEngine);
  const keyboardRange = new KeyboardRangeController(mainKeyboard, synth);

  document.querySelectorAll("#keyboard-tools button").forEach(btn => {
    btn.addEventListener("pointerdown", event => {
      event.preventDefault(); 
      keyboardRange.handleAction(btn.dataset.action);
    });
  });

  let currentHarmonyRoot = 60;
  
function setHarmonyRoot(midi) {
    currentHarmonyRoot = midi;
    audioEngine.setTuningRootMidi(currentHarmonyRoot);
    
    const start = harmonyKeyboard.startMidi;
    const displayMidi = start + (((midi - start) % 12) + 12) % 12;
    
    harmonyKeyboard.highlightHarmonyKey(displayMidi);
  }
  
  setHarmonyRoot(currentHarmonyRoot);

  let harmonyMode = "lowest";
  let activeNoteCount = 0;
  const autoBtns = document.querySelectorAll(".auto-btn");

  function updateHarmonyAuto() {
    const activeNotes = Array.from(synth.activeNotes);
    const newCount = activeNotes.length;

    if (harmonyMode === "lowest" && newCount > 0) {
      setHarmonyRoot(Math.min(...activeNotes));
    } else if (harmonyMode === "first") {
      if (activeNoteCount === 0 && newCount > 0) {
        setHarmonyRoot(activeNotes[0]);
      }
    }
    
    activeNoteCount = newCount;
  }

  synth.onNotesChanged = updateHarmonyAuto;

  function setHarmonyMode(mode) {
    harmonyMode = mode;
    autoBtns.forEach(btn => btn.classList.toggle("selected", btn.dataset.mode === mode));
    updateHarmonyAuto();
  }

  autoBtns.forEach(btn => {
    btn.addEventListener("pointerdown", event => {
      event.preventDefault();
      setHarmonyMode(btn.dataset.mode);
    });
  });

  harmonyKeyboard.onPointerNote(event => {
    if (event.type === "down") {
      setHarmonyMode("manual");
      setHarmonyRoot(event.midi);
    }
  });

  const instrumentSelect = document.getElementById("instrument-select");
  for (const [key, inst] of Object.entries(INSTRUMENTS)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = inst.name;
    instrumentSelect.appendChild(option);
  }
  
  instrumentSelect.value = audioEngine.currentInstrument;
  instrumentSelect.addEventListener("change", event => {
    audioEngine.setInstrument(event.target.value);
  });

  const tuningSelect = document.getElementById("tuning-select");
  const tuningButton = document.getElementById("tuning-use-button");
  let useTuningEnabled = false;

  Object.entries(TUNINGS).forEach(([key, tuning]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = tuning.name;
    tuningSelect.appendChild(option);
  });

  tuningSelect.value = audioEngine.tuningMode;

  function updateTuningMode() {
    if (useTuningEnabled) {
      audioEngine.setTuningMode(tuningSelect.value);
      tuningButton.classList.add("selected");
    } else {
      audioEngine.setTuningMode("equal");
      tuningButton.classList.remove("selected");
    }
  }

  tuningSelect.addEventListener("change", updateTuningMode);
  tuningButton.addEventListener("pointerdown", event => {
    event.preventDefault();
    useTuningEnabled = !useTuningEnabled;
    updateTuningMode();
  });
  updateTuningMode();

  const btnSustain = document.getElementById("btn-sustain");
  const btnRelease = document.getElementById("btn-release");

  function updateSustainVisual() {
    btnSustain.classList.toggle("selected", synth.sustainEnabled);
  }

  btnSustain.addEventListener("pointerdown", event => {
    event.preventDefault();
    synth.setSustainEnabled(!synth.sustainEnabled);
    updateSustainVisual();
  });

  btnRelease.addEventListener("pointerdown", event => {
    event.preventDefault();
    synth.releaseAllHeldKeys();
    btnRelease.classList.add("selected");
    setTimeout(() => {
      btnRelease.classList.remove("selected");
    }, 120);
  });
  updateSustainVisual();

  const pitchInput = document.getElementById("tone-input");
  const btnPitchDown = document.getElementById("btn-pitch-down");
  const btnPitchUp = document.getElementById("btn-pitch-up");

  function updatePitch(val) {
    pitchInput.value = val;
    audioEngine.setA4Frequency(val);
  }

  pitchInput.addEventListener("input", event => {
    const val = Number(event.target.value);
    if (!Number.isNaN(val)) audioEngine.setA4Frequency(val);
  });

  btnPitchDown.addEventListener("pointerdown", event => {
    event.preventDefault();
    updatePitch(Number(pitchInput.value) - 1);
  });
  
  btnPitchUp.addEventListener("pointerdown", event => {
    event.preventDefault();
    updatePitch(Number(pitchInput.value) + 1);
  });

  mainKeyboard.onPointerNote(event => {
    audioEngine.ensureStarted();
    synth.handlePointerEvent(event.type, event.midi);
  });

  harmonyKeyboard.onPointerNote(event => {
    if (event.type === "down") {
      currentHarmonyRoot = event.midi;
      harmonyKeyboard.highlightHarmonyKey(event.midi);
      audioEngine.setTuningRootMidi(currentHarmonyRoot);
    }
  });

  let currentTranspose = 0;
  const transValDisplay = document.getElementById("trans-val");
  const btnTransDown = document.getElementById("btn-trans-down");
  const btnTransUp = document.getElementById("btn-trans-up");

  function updateTranspose(offset) {
    const diff = offset - currentTranspose;
    currentTranspose = offset;
    transValDisplay.textContent = currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose;
    
    mainKeyboard.setTranspose(currentTranspose);
    
    harmonyKeyboard.transposeOffset = currentTranspose;
    harmonyKeyboard.setRange({ startMidi: 60 + currentTranspose, keyCount: 12 });
    
    setHarmonyRoot(currentHarmonyRoot + diff);
    
    synth.syncAllVisuals();
  }

  btnTransDown.addEventListener("pointerdown", event => {
    event.preventDefault();
    updateTranspose(currentTranspose - 1);
  });

  btnTransUp.addEventListener("pointerdown", event => {
    event.preventDefault();
    updateTranspose(currentTranspose + 1);
  });

  function updateFullscreenButton() {
    fullscreenButton.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
  }

  fullscreenButton.addEventListener("pointerdown", async event => {
    event.preventDefault();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.fullscreenEnabled) {
        await appRoot.requestFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen failed:", err);
    }
    updateFullscreenButton();
  });

  document.addEventListener("fullscreenchange", updateFullscreenButton);
  updateFullscreenButton();

  document.body.addEventListener(
    "pointerdown",
    () => { void audioEngine.ensureStarted(); },
    { once: true }
  );

  document.addEventListener("contextmenu", event => {
    event.preventDefault();
  });
}

// Prevent pinch-to-zoom and multi-touch gestures
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

// Prevent double-tap-to-zoom on rapid interactions
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

