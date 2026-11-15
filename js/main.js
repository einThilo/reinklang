import { Keyboard, clamp } from "./keyboard.js";
import { INSTRUMENTS } from "./instruments.js";
import { TUNINGS } from "./tuning.js";
import { AudioEngine } from "./audio.js";

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

