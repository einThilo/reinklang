import { Keyboard, clamp } from "./keyboard.js";
import { HarmonyKeyboard } from "./harmony.js";
import { INSTRUMENTS } from "./instruments.js";
import { TUNINGS, frequencyFromState, centsFromEqual, deviationPosition, formatCents } from "./tuning.js";
import { AudioEngine } from "./audio.js";
import { SynthController, connectAutoRoot } from "./player.js";
import { state, setState, setStates, onStateChange, LIMITS } from "./state.js";
import { readOptions } from "./options.js";
import { keepScreenAwake } from "./wakelock.js";

// Schalter für Prototypen (?name=wert), siehe options.js.
const options = readOptions(location.search);

// Layout-Varianten: ?layout=<name> setzt die Klasse layout-<name> am <body>
// (Regeln dazu in css/style.css). Ohne Zusatz oder bei unbekanntem Namen gilt die Vorgabe.
const LAYOUTS = ["band", "band-unten", "ecke", "ecken", "klassisch-2", "band-gruppe"];

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
    transposeOffset: state.transpose,
    cutEdgeKeys: true
  });

  const harmonyKeyboard = new HarmonyKeyboard({
    container: document.getElementById("harmony-keyboard"),
    startMidi: harmonyStart()
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

  // Markiert den Grundton auf der Grundton-Klaviatur (in deren Oktave): kräftig, wenn er von Hand
  // gewählt ist, blass, wenn die Automatik ihn gefunden hat; bei ausgeschaltetem Tuning gar nicht.
  function updateRootHighlight() {
    const start = harmonyKeyboard.startMidi;
    const displayMidi = start + (((state.rootMidi - start) % 12) + 12) % 12;

    harmonyKeyboard.highlight(state.useTuning ? displayMidi : null, state.harmonyMode !== "manual");
  }

  setupKeyboardRange(mainKeyboard);
  setupHarmony(harmonyKeyboard, updateRootHighlight);
  setupInstrument(audioEngine);
  setupTuning();
  setupSustain(synth);
  setupPitch();
  setupTranspose(mainKeyboard, harmonyKeyboard, updateRootHighlight);
  setupFullscreen();
  setupDeviation(harmonyKeyboard);

  setupStartOverlay(audioEngine);

  document.body.addEventListener(
    "pointerdown",
    () => { void audioEngine.ensureStarted(); },
    { once: true }
  );

  document.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  // Prototyp W5.1 (`?wach=1`): Bildschirm wach halten, solange die Seite sichtbar ist.
  const awake = options.wach ? keepScreenAwake(navigator, document) : null;

  // Prototyp S1.1 (`?diagnose=1`): Das Feld aus diagnose.js erfährt, dass der Start durchgelaufen ist.
  if (window.reinklangDiagnose) {
    if (awake) {
      window.reinklangDiagnose.report("Wachhalten", () =>
        awake.supported ? (awake.isActive() ? "aktiv" : "nicht aktiv") : "hier nicht möglich (braucht https://)");
    }
    window.reinklangDiagnose.report("Klang", () => (audioEngine.ctx ? audioEngine.ctx.state : "noch nicht angelegt"));
    window.reinklangDiagnose.report("main.js", "gestartet");
  }
}

// Unterster Ton der Grundton-Klaviatur: das (transponierte) C4; sie umfasst eine Oktave.
function harmonyStart() {
  return 60 + state.transpose;
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

// Grundton-Klaviatur (L7). Die Sonderhäuser: links „⇤“ (Automatik „Tiefster“), rechts „1.“
// (Automatik „Erster“), in der Lücke e–f „tuning off“. Ein Ton- oder Automatikhaus schaltet das
// Tuning ein, „tuning off“ schaltet es aus und ist nur bei eingeschaltetem Tuning sichtbar.
const SPECIAL_HOUSES = {
  left: { label: "⇤", mode: "lowest" },
  right: { label: "1.", mode: "first" },
  middle: { label: "tuning off", mode: null }
};

function setupHarmony(harmonyKeyboard, updateRootHighlight) {
  for (const [name, { label }] of Object.entries(SPECIAL_HOUSES)) {
    const labelElement = document.createElement("span");
    labelElement.className = "special-label";
    labelElement.textContent = label;
    harmonyKeyboard.specialElements.get(name).appendChild(labelElement);
  }

  function updateSpecialHouses() {
    for (const [name, { mode }] of Object.entries(SPECIAL_HOUSES)) {
      const element = harmonyKeyboard.specialElements.get(name);
      if (mode) element.classList.toggle("selected", state.useTuning && state.harmonyMode === mode);
      else element.classList.toggle("hidden", !state.useTuning);
    }
  }

  harmonyKeyboard.onPress(
    midi => setStates({ harmonyMode: "manual", rootMidi: midi, useTuning: true }),
    name => {
      const { mode } = SPECIAL_HOUSES[name];
      if (mode) setStates({ harmonyMode: mode, useTuning: true });
      else setState("useTuning", false);
    }
  );

  onStateChange(["rootMidi", "harmonyMode", "useTuning"], updateRootHighlight);
  onStateChange(["harmonyMode", "useTuning"], updateSpecialHouses);

  updateRootHighlight();
  updateSpecialHouses();
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

// Auswahlliste für die Stimmung.
function setupTuning() {
  const tuningSelect = document.getElementById("tuning-select");

  Object.entries(TUNINGS).forEach(([key, tuning]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = tuning.name;
    tuningSelect.appendChild(option);
  });

  function updateTuningControls() {
    tuningSelect.value = state.tuningMode;
  }

  tuningSelect.addEventListener("change", () => {
    setState("tuningMode", tuningSelect.value);
  });

  onStateChange(["tuningMode"], updateTuningControls);
  updateTuningControls();
}

// Buttons „Sustain“ und „Release“.
function setupSustain(synth) {
  const btnSustain = document.getElementById("btn-sustain");
  const btnRelease = document.getElementById("btn-release");

  function updateSustainVisual() {
    btnSustain.classList.toggle("selected", state.sustain);
  }

  setupSustainPedal(synth, btnSustain, updateSustainVisual);

  btnRelease.addEventListener("pointerdown", event => {
    event.preventDefault();
    synth.releaseAllHeldKeys();
    btnRelease.classList.add("selected");
    setTimeout(() => {
      btnRelease.classList.remove("selected");
    }, 120);
  });

  // Rahmen im Rot der gehaltenen Tasten, solange Release etwas beenden würde (W6).
  synth.onHeldChanged = hasHeld => btnRelease.classList.toggle("has-held", hasHeld);

  onStateChange(["sustain"], (key, value) => {
    synth.setSustainEnabled(value);
    updateSustainVisual();
  });
  updateSustainVisual();
}

// Der Sustain-Button wirkt als Pedal, solange er gedrückt ist (W4.2). Ändert sich währenddessen kein
// Tastenzustand, wirkt er beim Loslassen als Umschalter bzw. hält gedrückte Tasten (S3, siehe `pedalUp`).
// Nach dem Pedal bleibt Sustain, wie es vorher war.
function setupSustainPedal(synth, btnSustain, updateSustainVisual) {
  let pedalPointer = null;

  btnSustain.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (pedalPointer !== null) return;
    pedalPointer = event.pointerId;
    try {
      btnSustain.setPointerCapture(event.pointerId);
    } catch {}
    synth.pedalDown();
    btnSustain.classList.add("selected");
  });

  const release = event => {
    if (event.pointerId !== pedalPointer) return;
    pedalPointer = null;
    const result = synth.pedalUp();
    if (result === "toggle") setState("sustain", !state.sustain);
    updateSustainVisual();
  };
  btnSustain.addEventListener("pointerup", release);
  btnSustain.addEventListener("pointercancel", release);
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
    harmonyKeyboard.setStart(harmonyStart());

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

// Startfläche „Tippen zum Starten“ über der ganzen Seite (S2.2). Der Browser lässt den Klang erst nach
// einer Nutzeraktion zu, und bei Berührung zählt erst das Loslassen; der erste Tipp gilt deshalb der Fläche.
function setupStartOverlay(audioEngine) {
  const overlay = document.createElement("div");
  overlay.id = "start-overlay";
  overlay.textContent = "Tippen zum Starten";
  overlay.addEventListener("pointerdown", event => event.preventDefault());
  overlay.addEventListener("pointerup", () => {
    audioEngine.ensureStarted();
    overlay.remove();
  });
  document.body.appendChild(overlay);
}

// Abweichungsanzeige (Z1.1): zeigt bei „Use tuning“ auf jeder Grundton-Taste eine rote Linie für die
// aktuelle Stimmung (Tastenmitte = gleichstufig) und die Abweichung in Cent.
// Muss nach `setupTranspose` angemeldet werden: Die Transposition belegt die Tasten mit neuen Tönen.
function setupDeviation(harmonyKeyboard) {
  function renderDeviations() {
    for (const [midi, keyElement] of harmonyKeyboard.keyElements) {
      keyElement.querySelector(".deviation")?.remove();
      if (!state.useTuning) continue;

      const cents = centsFromEqual(midi, state);
      const box = document.createElement("div");
      box.className = "deviation";
      const marker = document.createElement("div");
      marker.className = "deviation-marker";
      marker.style.left = deviationPosition(cents) + "%";
      const value = document.createElement("div");
      value.className = "deviation-value";
      value.textContent = formatCents(cents);

      marker.appendChild(value);
      box.appendChild(marker);
      keyElement.appendChild(box);
    }
  }

  onStateChange(["rootMidi", "tuningMode", "useTuning", "transpose"], renderDeviations);
  renderDeviations();
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

  // Symbol „⛶“ in beiden Zuständen (L5); der Hinweis beim Darüberfahren sagt, was der Tipp bewirkt.
  function updateFullscreenButton() {
    fullscreenButton.textContent = "⛶";
    fullscreenButton.title = document.fullscreenElement ? "Vollbild beenden" : "Vollbild";
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

// Berührungssperren gegen Zoomen.
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
  // Auswahllisten und Eingabefelder sind ausgenommen: Sonst ginge ihr Klick verloren, wenn man sie
  // direkt nach dem Spielen antippt (S13).
  const onFormControl = e.target.closest && e.target.closest("select, input");
  if (now - lastTouchEnd <= 300 && !onFormControl) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });
