import { Keyboard, clamp } from "./keyboard.js";
import { INSTRUMENTS } from "./instruments.js";
import { TUNINGS, midiToFrequency } from "./tuning.js";
import { AudioEngine } from "./audio.js";
import { SynthController, connectAutoRoot } from "./player.js";
import { state, setState, onStateChange } from "./state.js";

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

  const audioEngine = new AudioEngine(state.instrument);

  const frequencyOf = midi => midiToFrequency(midi, {
    a4Frequency: state.a4Frequency,
    tuningMode: state.useTuning ? state.tuningMode : "equal",
    tuningRootMidi: state.rootMidi
  });

  const synth = new SynthController(mainKeyboard, audioEngine, frequencyOf);
  const keyboardRange = new KeyboardRangeController(mainKeyboard, synth);
  connectAutoRoot(synth);

  document.querySelectorAll("#keyboard-tools button").forEach(btn => {
    btn.addEventListener("pointerdown", event => {
      event.preventDefault(); 
      keyboardRange.handleAction(btn.dataset.action);
    });
  });

  function updateRootHighlight() {
    const start = harmonyKeyboard.startMidi;
    const displayMidi = start + (((state.rootMidi - start) % 12) + 12) % 12;

    harmonyKeyboard.highlightHarmonyKey(displayMidi);
  }

  updateRootHighlight();

  const autoBtns = document.querySelectorAll(".auto-btn");

  function updateHarmonyModeButtons() {
    autoBtns.forEach(btn => btn.classList.toggle("selected", btn.dataset.mode === state.harmonyMode));
  }

  autoBtns.forEach(btn => {
    btn.addEventListener("pointerdown", event => {
      event.preventDefault();
      setState("harmonyMode", btn.dataset.mode);
    });
  });
  updateHarmonyModeButtons();

  harmonyKeyboard.onPointerNote(event => {
    if (event.type === "down") {
      setState("harmonyMode", "manual");
      setState("rootMidi", event.midi);
    }
  });

  const instrumentSelect = document.getElementById("instrument-select");
  for (const [key, inst] of Object.entries(INSTRUMENTS)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = inst.name;
    instrumentSelect.appendChild(option);
  }
  
  instrumentSelect.value = state.instrument;
  instrumentSelect.addEventListener("change", () => {
    setState("instrument", instrumentSelect.value);
  });

  const tuningSelect = document.getElementById("tuning-select");
  const tuningButton = document.getElementById("tuning-use-button");

  Object.entries(TUNINGS).forEach(([key, tuning]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = tuning.name;
    tuningSelect.appendChild(option);
  });

  function updateTuningControls() {
    tuningSelect.value = state.tuningMode;
    tuningButton.classList.toggle("selected", state.useTuning);
  }

  tuningSelect.addEventListener("change", () => {
    setState("tuningMode", tuningSelect.value);
  });
  tuningButton.addEventListener("pointerdown", event => {
    event.preventDefault();
    setState("useTuning", !state.useTuning);
  });
  updateTuningControls();

  onStateChange((key, value, previous) => {
    if (key === "rootMidi" || key === "tuningMode" || key === "useTuning" || key === "a4Frequency") {
      audioEngine.retuneAllVoices(frequencyOf);
    }
    if (key === "rootMidi") updateRootHighlight();
    if (key === "harmonyMode") updateHarmonyModeButtons();
    if (key === "tuningMode" || key === "useTuning") updateTuningControls();
    if (key === "a4Frequency") updatePitchInput();
    if (key === "transpose") applyTranspose(value - previous);
    if (key === "instrument") {
      audioEngine.setInstrument(value);
      instrumentSelect.value = value;
    }
  });

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

  // Schreibt den Stimmton ins Zahlenfeld, aber nur, wenn dort eine andere Zahl steht
  // (sonst würde das Tippen im Feld gestört).
  function updatePitchInput() {
    if (Number(pitchInput.value) !== state.a4Frequency) pitchInput.value = state.a4Frequency;
  }

  pitchInput.addEventListener("input", event => {
    const val = Number(event.target.value);
    if (!Number.isNaN(val)) setState("a4Frequency", val);
  });

  btnPitchDown.addEventListener("pointerdown", event => {
    event.preventDefault();
    setState("a4Frequency", Number(pitchInput.value) - 1);
  });
  
  btnPitchUp.addEventListener("pointerdown", event => {
    event.preventDefault();
    setState("a4Frequency", Number(pitchInput.value) + 1);
  });

  mainKeyboard.onPointerNote(event => {
    audioEngine.ensureStarted();
    synth.handlePointerEvent(event.type, event.midi);
  });

  const transValDisplay = document.getElementById("trans-val");
  const btnTransDown = document.getElementById("btn-trans-down");
  const btnTransUp = document.getElementById("btn-trans-up");

  // Verschiebt beide Klaviaturen auf die neue Transposition; der Grundton wandert um `diff` mit.
  function applyTranspose(diff) {
    transValDisplay.textContent = state.transpose > 0 ? `+${state.transpose}` : state.transpose;
    
    mainKeyboard.setTranspose(state.transpose);
    
    harmonyKeyboard.transposeOffset = state.transpose;
    harmonyKeyboard.setRange({ startMidi: 60 + state.transpose, keyCount: 12 });
    
    setState("rootMidi", clamp(state.rootMidi + diff, 0, 127));
    updateRootHighlight();
    
    synth.syncAllVisuals();
  }

  btnTransDown.addEventListener("pointerdown", event => {
    event.preventDefault();
    setState("transpose", state.transpose - 1);
  });

  btnTransUp.addEventListener("pointerdown", event => {
    event.preventDefault();
    setState("transpose", state.transpose + 1);
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

