import { Keyboard, clamp } from "./keyboard.js";
import { INSTRUMENTS } from "./instruments.js";
import { TUNINGS, frequencyFromState } from "./tuning.js";
import { AudioEngine } from "./audio.js";
import { SynthController, connectAutoRoot } from "./player.js";
import { state, setState, setStates, onStateChange, LIMITS } from "./state.js";
import { readOptions } from "./options.js";

// Schalter für Prototypen (?name=wert), siehe options.js.
const options = readOptions(location.search);

// Layout-Varianten: ?layout=<name> setzt die Klasse layout-<name> am <body>
// (Regeln dazu in css/style.css). Ohne Zusatz oder bei unbekanntem Namen gilt die Vorgabe.
const LAYOUTS = ["band", "band-unten", "ecke", "ecken"];

document.addEventListener("DOMContentLoaded", init);

/* ============================================================
   APP INITIALIZATION
   ============================================================ */

function init() {
  setupLayout();

  const mainKeyboard = new Keyboard({
    container: document.getElementById("keyboard"),
    startMidi: state.keyboardStartMidi,
    keyCount: state.keyboardKeyCount,
    transposeOffset: state.transpose
  });

  const harmonyKeyboard = new Keyboard({
    container: document.getElementById("harmony-keyboard"),
    ...harmonyRange(),
    transposeOffset: state.transpose
  });

  const audioEngine = new AudioEngine(state.instrument);

  const frequencyOf = midi => frequencyFromState(midi, state);

  const synth = new SynthController(mainKeyboard, audioEngine, frequencyOf);
  synth.setSustainEnabled(state.sustain);
  connectAutoRoot(synth);

  onStateChange(["rootMidi", "tuningMode", "useTuning", "a4Frequency"], () => {
    audioEngine.retuneAllVoices(frequencyOf);
  });

  mainKeyboard.onPointerNote(event => {
    audioEngine.ensureStarted();
    synth.handlePointerEvent(event.type, event.midi);
  });

  // Markiert den Grundton auf der Grundton-Klaviatur (in deren Oktave).
  function updateRootHighlight() {
    const start = harmonyKeyboard.startMidi;
    const displayMidi = start + (((state.rootMidi - start) % 12) + 12) % 12;

    harmonyKeyboard.highlightHarmonyKey(displayMidi);
  }

  setupKeyboardRange(mainKeyboard);
  setupHarmony(harmonyKeyboard, updateRootHighlight);
  setupInstrument(audioEngine);
  setupTuning();
  setupSustain(synth);
  setupPitch();
  setupTranspose(mainKeyboard, harmonyKeyboard, updateRootHighlight);
  setupFullscreen();

  document.body.addEventListener(
    "pointerdown",
    () => { void audioEngine.ensureStarted(); },
    { once: true }
  );

  document.addEventListener("contextmenu", event => {
    event.preventDefault();
  });
}

// Bereich der Grundton-Klaviatur: eine Oktave ab dem (transponierten) C4.
function harmonyRange() {
  return { startMidi: 60 + state.transpose, keyCount: 12 };
}

/* ============================================================
   BEDIENBEREICHE
   ============================================================ */

// Tastenbereich der Hauptklaviatur: unterster Ton und Tastenanzahl.
function setupKeyboardRange(mainKeyboard) {
  // Verschiebt den untersten Ton nur so weit, dass die bisherige Tastenanzahl noch passt
  // (die übrigen Grenzen setzt `state.js`).
  function moveKeyboardStart(delta) {
    setState("keyboardStartMidi", Math.min(state.keyboardStartMidi + delta, 128 - state.keyboardKeyCount));
  }

  function handleRangeAction(action) {
    switch (action) {
      case "decKeys":
        setState("keyboardKeyCount", state.keyboardKeyCount - 1);
        break;
      case "incKeys":
        setState("keyboardKeyCount", state.keyboardKeyCount + 1);
        break;
      case "octDown":
        moveKeyboardStart(-12);
        break;
      case "semiDown":
        moveKeyboardStart(-1);
        break;
      case "semiUp":
        moveKeyboardStart(1);
        break;
      case "octUp":
        moveKeyboardStart(12);
        break;
    }
  }

  document.querySelectorAll("#keyboard-tools button").forEach(btn => {
    btn.addEventListener("pointerdown", event => {
      event.preventDefault();
      handleRangeAction(btn.dataset.action);
    });
  });

  onStateChange(["keyboardStartMidi", "keyboardKeyCount"], () => {
    mainKeyboard.setRange({ startMidi: state.keyboardStartMidi, keyCount: state.keyboardKeyCount });
  });
}

// Grundton-Klaviatur und Harmonie-Automatik („Tiefster“, „Erster“).
function setupHarmony(harmonyKeyboard, updateRootHighlight) {
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

  harmonyKeyboard.onPointerNote(event => {
    if (event.type === "down") {
      setState("harmonyMode", "manual");
      setState("rootMidi", event.midi);
    }
  });

  onStateChange(["rootMidi"], updateRootHighlight);
  onStateChange(["harmonyMode"], updateHarmonyModeButtons);

  updateRootHighlight();
  updateHarmonyModeButtons();
}

// Auswahlliste für das Instrument.
function setupInstrument(audioEngine) {
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

  onStateChange(["instrument"], (key, value) => {
    audioEngine.setInstrument(value);
    instrumentSelect.value = value;
  });
}

// Auswahlliste für die Stimmung und Button „Use tuning“.
function setupTuning() {
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

  onStateChange(["tuningMode", "useTuning"], updateTuningControls);
  updateTuningControls();
}

// Buttons „Sustain“ und „Release“.
function setupSustain(synth) {
  const btnSustain = document.getElementById("btn-sustain");
  const btnRelease = document.getElementById("btn-release");

  function updateSustainVisual() {
    btnSustain.classList.toggle("selected", state.sustain);
  }

  // Sind Tasten gedrückt, werden sie gehalten und Sustain bleibt aus (kurzes Aufleuchten);
  // sonst schaltet der Button Sustain um.
  btnSustain.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (!state.sustain && synth.holdPressedKeys()) {
      btnSustain.classList.add("selected");
      setTimeout(() => btnSustain.classList.remove("selected"), 120);
      return;
    }
    setState("sustain", !state.sustain);
  });

  btnRelease.addEventListener("pointerdown", event => {
    event.preventDefault();
    synth.releaseAllHeldKeys();
    btnRelease.classList.add("selected");
    setTimeout(() => {
      btnRelease.classList.remove("selected");
    }, 120);
  });

  onStateChange(["sustain"], (key, value) => {
    synth.setSustainEnabled(value);
    updateSustainVisual();
  });
  updateSustainVisual();
}

// Stimmton: Zahlenfeld und +/−.
function setupPitch() {
  const pitchInput = document.getElementById("tone-input");
  const btnPitchDown = document.getElementById("btn-pitch-down");
  const btnPitchUp = document.getElementById("btn-pitch-up");

  // Schreibt den Stimmton ins Zahlenfeld, aber nur, wenn dort eine andere Zahl steht
  // (sonst würde das Tippen im Feld gestört).
  function updatePitchInput() {
    if (Number(pitchInput.value) !== state.a4Frequency) pitchInput.value = state.a4Frequency;
  }

  // Der Stimmton wird erst beim Abschicken übernommen (Enter oder Tipp außerhalb des Felds);
  // ein leeres Feld springt auf den bisherigen Wert zurück, Zahlen außerhalb der Grenzen auf die Grenze.
  pitchInput.addEventListener("change", () => {
    const val = Number(pitchInput.value);
    if (pitchInput.value !== "" && Number.isFinite(val)) setState("a4Frequency", val);
    pitchInput.value = state.a4Frequency;
  });

  pitchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") pitchInput.blur();
  });

  // Ein Tipp außerhalb des Felds nimmt den Cursor heraus, damit die Bildschirmtastatur zu bleibt.
  // Nötig, weil die Bedienelemente das normale Verhalten beim Antippen unterdrücken.
  document.addEventListener("pointerdown", event => {
    if (document.activeElement !== pitchInput || event.target === pitchInput) return;
    // +/− rechnen vom gültigen Stimmton; eine nicht abgeschickte Eingabe wird dann verworfen.
    if (btnPitchUp.contains(event.target) || btnPitchDown.contains(event.target)) {
      pitchInput.value = state.a4Frequency;
    }
    pitchInput.blur();
  }, { capture: true });

  addRepeatOnHold(btnPitchDown, () => setState("a4Frequency", state.a4Frequency - 1));
  addRepeatOnHold(btnPitchUp, () => setState("a4Frequency", state.a4Frequency + 1));

  onStateChange(["a4Frequency"], updatePitchInput);
  updatePitchInput();
}

// Ruft `action` beim Drücken sofort auf und wiederholt sie, solange der Button gedrückt bleibt.
function addRepeatOnHold(button, action) {
  let delayTimer = null;
  let repeatTimer = null;
  const stop = () => {
    clearTimeout(delayTimer);
    clearInterval(repeatTimer);
  };
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    stop();
    action();
    delayTimer = setTimeout(() => { repeatTimer = setInterval(action, 60); }, 400);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(type => button.addEventListener(type, stop));
}

// Transposition: Anzeige und Buttons.
function setupTranspose(mainKeyboard, harmonyKeyboard, updateRootHighlight) {
  const transValDisplay = document.getElementById("trans-val");
  const btnTransDown = document.getElementById("btn-trans-down");
  const btnTransUp = document.getElementById("btn-trans-up");

  function updateTransposeDisplay() {
    transValDisplay.textContent = state.transpose > 0 ? `+${state.transpose}` : state.transpose;
  }

  // Ändert die Transposition innerhalb ihrer Grenzen; der Grundton wandert in einem Schritt um
  // dieselbe Differenz mit.
  function transposeBy(delta) {
    const next = clamp(state.transpose + delta, LIMITS.transpose.min, LIMITS.transpose.max);
    setStates({ transpose: next, rootMidi: state.rootMidi + next - state.transpose });
  }

  // Verschiebt beide Klaviaturen auf die neue Transposition.
  function applyTranspose() {
    updateTransposeDisplay();

    mainKeyboard.setRange({ transposeOffset: state.transpose });
    harmonyKeyboard.setRange({ ...harmonyRange(), transposeOffset: state.transpose });

    updateRootHighlight();
  }

  btnTransDown.addEventListener("pointerdown", event => {
    event.preventDefault();
    transposeBy(-1);
  });

  btnTransUp.addEventListener("pointerdown", event => {
    event.preventDefault();
    transposeBy(1);
  });

  onStateChange(["transpose"], applyTranspose);
  updateTransposeDisplay();
}

// Layout-Variante aus der Adresse.
function setupLayout() {
  const name = new URLSearchParams(location.search).get("layout");
  if (LAYOUTS.includes(name)) {
    document.body.classList.add(`layout-${name}`);
  }
}

// Fullscreen-Button.
function setupFullscreen() {
  const appRoot = document.getElementById("app");
  const fullscreenButton = document.getElementById("fullscreen-toggle");

  function updateFullscreenButton() {
    fullscreenButton.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
  }

  fullscreenButton.addEventListener("pointerdown", event => {
    event.preventDefault();
  });

  // Umgeschaltet wird beim Loslassen: Der Browser erlaubt Vollbild nur aus einer Nutzeraktion,
  // und bei Berührung zählt erst das Loslassen als solche.
  fullscreenButton.addEventListener("pointerup", async () => {
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
}

// Berührungssperren gegen Zoomen; `?sperren=aus` lässt sie weg (Prototyp S2.1).
if (options.sperren !== "aus") {
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
}
