import { Keyboard, clamp, touchesInside } from "./keyboard.js";
import { HarmonyKeyboard, middleHouseChange } from "./harmony.js";
import { INSTRUMENTS } from "./instruments.js";
import { TUNINGS, frequencyFromState, centsFromEqual, deviationPosition, formatCents } from "./tuning.js";
import { AudioEngine } from "./audio.js";
import { SynthController, connectAutoRoot } from "./player.js";
import { state, setState, setStates, onStateChange, LIMITS } from "./state.js";
import { readOptions } from "./options.js";
import { keepScreenAwake } from "./wakelock.js";
import { isInstalledApp } from "./installed.js";
import { createStepRun } from "./steps.js";
import { setupComputerKeys } from "./computerkeys.js";
import { keepLandscape, lockLandscape } from "./orientation.js";
import { VERSION } from "./version.js";

// Schalter für Prototypen (?name=wert), siehe options.js.
const options = readOptions(location.search);

// Layout-Varianten: ?layout=<name> setzt die Klasse layout-<name> am <body>
// (Regeln dazu in css/style.css). Ohne Zusatz oder bei unbekanntem Namen gilt DEFAULT_LAYOUT;
// ?layout=alt zeigt die frühere Vorgabe (keine Layout-Klasse).
const DEFAULT_LAYOUT = "block4";
const LAYOUTS = ["band", "band-unten", "ecke", "ecken", "klassisch-2", "band-gruppe", "block1", "block2", "block3", "band1", "block4"];

document.addEventListener("DOMContentLoaded", init);

/* ============================================================
   APP INITIALIZATION
   ============================================================ */

function init() {
  setupLayout();
  // L10: Im Hochformat wird die App gedreht (Oberkante rechts).
  keepLandscape(window, document);

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
  const sustain = setupSustain(synth, mainKeyboard);
  setupComputerKeyboard(mainKeyboard, synth, audioEngine, sustain);
  setupPitch();
  setupTranspose(mainKeyboard, harmonyKeyboard, updateRootHighlight);
  setupFullscreen();
  setupDeviation(harmonyKeyboard);

  setupStopWhenHidden(synth, mainKeyboard, audioEngine, sustain.cancelPedal);

  setupStartOverlay(audioEngine);
  registerServiceWorker();

  document.body.addEventListener(
    "pointerdown",
    () => { void audioEngine.ensureStarted(); },
    { once: true }
  );

  document.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  // W5: Bildschirm wach halten, solange die Seite sichtbar ist (wirkt nur über https:// oder localhost).
  const awake = keepScreenAwake(navigator, document);

  // Prototyp S1.1 (`?diagnose=1`): Das Feld aus diagnose.js erfährt, dass der Start durchgelaufen ist.
  if (window.reinklangDiagnose) {
    window.reinklangDiagnose.report("Wachhalten", () =>
      awake.supported ? (awake.isActive() ? "aktiv" : "nicht aktiv") : "hier nicht möglich (braucht https://)");
    window.reinklangDiagnose.report("Klang", () => (audioEngine.ctx ? audioEngine.ctx.state : "noch nicht angelegt"));
    window.reinklangDiagnose.report("main.js", "gestartet");
  }
}

// Ob außer Fingern noch etwas Tasten gedrückt hält (die Computertastatur, Z10); S18 lässt sie klingen.
let otherPresses = () => false;
let forgetOtherPresses = () => {};

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
  // (die übrigen Grenzen setzt `state.js`). Gibt zurück, ob er sich bewegt hat.
  function moveKeyboardStart(delta) {
    const before = state.keyboardStartMidi;
    setState("keyboardStartMidi", Math.min(before + delta, 128 - state.keyboardKeyCount));
    return state.keyboardStartMidi !== before;
  }

  // Z19.1: Die Oktave läuft als 12 Halbtonschritte, damit das Verschieben sichtbar wird.
  const octaveRun = createStepRun({ step: moveKeyboardStart, intervalMs: 25 });

  function handleRangeAction(action) {
    if (action === "semiDown" || action === "semiUp") octaveRun.stop();
    switch (action) {
      case "decKeys":
        setState("keyboardKeyCount", state.keyboardKeyCount - 1);
        break;
      case "incKeys":
        setState("keyboardKeyCount", state.keyboardKeyCount + 1);
        break;
      case "octDown":
        octaveRun.start(-1, 12);
        break;
      case "semiDown":
        moveKeyboardStart(-1);
        break;
      case "semiUp":
        moveKeyboardStart(1);
        break;
      case "octUp":
        octaveRun.start(1, 12);
        break;
    }
  }

  // Z19: Tastenanzahl und Halbtonschritte wiederholen beim Halten, die Oktave nicht.
  document.querySelectorAll("#keyboard-tools button").forEach(btn => {
    const action = () => handleRangeAction(btn.dataset.action);
    if (btn.dataset.action.startsWith("oct")) {
      btn.addEventListener("pointerdown", event => {
        event.preventDefault();
        action();
      });
    } else {
      addRepeatOnHold(btn, action, SLOW_REPEAT_MS);
    }
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

  // W7: ob das Tuning in dieser Sitzung schon einmal an war; erst dann stellt die leere Lücke es wieder her.
  let tuningWasOn = state.useTuning;
  onStateChange(["useTuning"], (key, value) => { if (value) tuningWasOn = true; });

  harmonyKeyboard.onPress(
    midi => setStates({ harmonyMode: "manual", rootMidi: midi, useTuning: true }),
    name => {
      const { mode } = SPECIAL_HOUSES[name];
      if (mode) setStates({ harmonyMode: mode, useTuning: true });
      else {
        const change = middleHouseChange(state.useTuning, tuningWasOn);
        if (change) setStates(change);
      }
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
function setupSustain(synth, mainKeyboard) {
  const btnSustain = document.getElementById("btn-sustain");
  const btnRelease = document.getElementById("btn-release");
  const keyboardElement = document.getElementById("keyboard");

  function updateSustainVisual() {
    btnSustain.classList.toggle("selected", state.sustain);
  }

  const pedal = setupSustainPedal(synth, btnSustain, updateSustainVisual);

  // S18: Liegt beim Release kein Finger auf der Hauptklaviatur, endet auch, was noch als gedrückt gilt
  // (z. B. wenn iOS das Loslassen verschluckt hat). Liegt ein Finger dort, klingt sein Ton weiter.
  // Bei Berührung zählt die Liste `touches` des Geräts. Sie kommt erst mit „touchstart“, nach
  // „pointerdown“. Für Maus und Tastatur zählt die zuletzt gemeldete Liste.
  let lastTouches = [];
  for (const type of ["touchstart", "touchend", "touchcancel"]) {
    document.addEventListener(type, event => { lastTouches = Array.from(event.touches); },
      { capture: true, passive: true });
  }
  function releaseUnreleased(touches) {
    if (touchesInside(touches, keyboardElement) || otherPresses()) return;
    synth.forgetPresses();
    mainKeyboard.forgetPointers();
  }
  btnRelease.addEventListener("touchstart", event => releaseUnreleased(event.touches), { passive: true });

  // Release über den Button oder Escape (Z10).
  function release(touches) {
    synth.releaseAllHeldKeys();
    if (touches) releaseUnreleased(touches);
    btnRelease.classList.add("selected");
    setTimeout(() => {
      btnRelease.classList.remove("selected");
    }, 120);
  }
  btnRelease.addEventListener("pointerdown", event => {
    event.preventDefault();
    release(event.pointerType === "touch" ? null : lastTouches);
  });

  // Rahmen im Rot der gehaltenen Tasten, solange Release etwas beenden würde (W6).
  synth.onHeldChanged = hasHeld => btnRelease.classList.toggle("has-held", hasHeld);

  onStateChange(["sustain"], (key, value) => {
    synth.setSustainEnabled(value);
    updateSustainVisual();
  });
  updateSustainVisual();
  return {
    cancelPedal: pedal.cancel,
    pedalKey: down => (down ? pedal.press("Space") : pedal.lift("Space")),
    releaseKey: () => release(lastTouches)
  };
}

// Der Sustain-Button wirkt als Pedal, solange er gedrückt ist (W4.2). Ändert sich währenddessen kein
// Tastenzustand, wirkt er beim Loslassen als Umschalter bzw. hält gedrückte Tasten (S3, siehe `pedalUp`).
// Nach dem Pedal bleibt Sustain, wie es vorher war. Die Leertaste wirkt genauso (Z10).
// Liefert `press(owner)`, `lift(owner)` und `cancel()`; `owner` ist der Finger oder "Space".
function setupSustainPedal(synth, btnSustain, updateSustainVisual) {
  let pedalOwner = null;

  function press(owner) {
    if (pedalOwner !== null) return false;
    pedalOwner = owner;
    synth.pedalDown();
    btnSustain.classList.add("selected");
    return true;
  }
  function lift(owner) {
    if (owner !== pedalOwner) return;
    pedalOwner = null;
    const result = synth.pedalUp();
    if (result === "toggle") setState("sustain", !state.sustain);
    updateSustainVisual();
  }

  btnSustain.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (!press(event.pointerId)) return;
    try {
      btnSustain.setPointerCapture(event.pointerId);
    } catch {}
  });
  const release = event => lift(event.pointerId);
  btnSustain.addEventListener("pointerup", release);
  btnSustain.addEventListener("pointercancel", release);

  // Vergisst ein getretenes Pedal, ohne dass sein Loslassen etwas bewirkt (S19).
  function cancel() {
    if (pedalOwner === null) return;
    if (typeof pedalOwner === "number") {
      try {
        btnSustain.releasePointerCapture(pedalOwner);
      } catch {}
    }
    pedalOwner = null;
    updateSustainVisual();
  }

  return { press, lift, cancel };
}

// Z10: Spielen mit der Computertastatur auf den sichtbaren Tasten; Leertaste = Sustain, Escape = Release.
function setupComputerKeyboard(mainKeyboard, synth, audioEngine, sustain) {
  const computerKeys = setupComputerKeys({
    target: document,
    getKeys: () => mainKeyboard.keys,
    cutEdgeKeys: true,
    onNote: (type, midi) => {
      if (type === "down") audioEngine.ensureStarted();
      synth.handlePointerEvent(type, midi);
    },
    onPedal: sustain.pedalKey,
    onRelease: sustain.releaseKey
  });
  otherPresses = computerKeys.anyDown;
  forgetOtherPresses = computerKeys.forget;
}

// S19: Ist die Seite verborgen (Bildschirm aus, andere App, Tab im Hintergrund), endet alles, was klingt,
// gedrückte und gehaltene Tasten sind zurückgesetzt, Sustain bleibt, wie es war. Die Klangerzeugung hält an,
// damit keine Mediensteuerung bleibt; der nächste Anschlag setzt sie fort.
// Verliert das Fenster nur den Fokus, enden die Töne gedrückter Tasten, deren Loslassen nicht mehr ankommt;
// gehaltene klingen weiter.
function setupStopWhenHidden(synth, mainKeyboard, audioEngine, cancelPedal) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    cancelPedal();
    synth.stopAll();
    mainKeyboard.forgetPointers();
    forgetOtherPresses();
    audioEngine.silence();
  });
  window.addEventListener("blur", () => {
    synth.forgetPresses();
    mainKeyboard.forgetPointers();
    forgetOtherPresses();
  });
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

// Abstand der Wiederholungen beim Halten: Stimmton schnell (W2), Klaviatur und Transposition langsamer (Z19).
const FAST_REPEAT_MS = 60;
const SLOW_REPEAT_MS = 150;

// Ruft `action` beim Drücken sofort auf und wiederholt sie nach 0,4 s alle `intervalMs`,
// solange der Button gedrückt bleibt.
function addRepeatOnHold(button, action, intervalMs = FAST_REPEAT_MS) {
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
    delayTimer = setTimeout(() => { repeatTimer = setInterval(action, intervalMs); }, 400);
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

  addRepeatOnHold(btnTransDown, () => transposeBy(-1), SLOW_REPEAT_MS);
  addRepeatOnHold(btnTransUp, () => transposeBy(1), SLOW_REPEAT_MS);

  onStateChange(["transpose"], applyTranspose);
  updateTransposeDisplay();
}

// Startfläche „Tippen zum Starten“ über der ganzen Seite (S2.2). Der Browser lässt den Klang erst nach
// einer Nutzeraktion zu, und bei Berührung zählt erst das Loslassen; der erste Tipp gilt deshalb der Fläche.
function setupStartOverlay(audioEngine) {
  const overlay = document.createElement("div");
  overlay.id = "start-overlay";
  overlay.textContent = "Tippen zum Starten";
  const version = document.createElement("span");
  version.id = "start-version";
  version.textContent = VERSION;
  overlay.appendChild(version);
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
      const position = deviationPosition(cents);
      const box = document.createElement("div");
      box.className = "deviation";
      const marker = document.createElement("div");
      marker.className = "deviation-marker";
      marker.style.left = position + "%";
      // Z18: Die Zahl gleitet mit der Linie, bleibt aber in der Taste: bei 0 Cent mittig,
      // an den Rändern bündig, dazwischen anteilig.
      const value = document.createElement("div");
      value.className = "deviation-value";
      value.textContent = formatCents(cents);
      value.style.left = position + "%";
      value.style.transform = `translateX(-${position}%)`;

      box.appendChild(marker);
      box.appendChild(value);
      keyElement.appendChild(box);
    }
  }

  onStateChange(["rootMidi", "tuningMode", "useTuning", "transpose"], renderDeviations);
  renderDeviations();
}

// Layout-Variante aus der Adresse.
function setupLayout() {
  const name = new URLSearchParams(location.search).get("layout");
  if (name === "alt") return;
  const chosen = LAYOUTS.includes(name) ? name : DEFAULT_LAYOUT;
  document.body.classList.add(`layout-${chosen}`);
}

// Z7: Service Worker für den Start ohne Netz (sw.js). Gibt es nur über https:// oder localhost.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(err => console.error("Service Worker:", err));
}

// Fullscreen-Button.
function setupFullscreen() {
  const fullscreenButton = document.getElementById("fullscreen-toggle");

  // Z7: Als installierte App läuft die Seite schon im Vollbild (aus dem Manifest, nicht beendbar).
  // Z15: Dort steht stattdessen ✕ und schließt die App (Android erlaubt das).
  // Z15.1: zweistufig: erster Tipp macht das ✕ rot und dick, erst der zweite schließt. Jeder Druck
  // woanders setzt zurück und behält seine normale Wirkung.
  if (isInstalledApp()) {
    let armed = false;
    function setArmed(value) {
      armed = value;
      fullscreenButton.textContent = armed ? "✖" : "✕";
      fullscreenButton.title = armed ? "Nochmal tippen zum Schließen" : "Schließen";
      fullscreenButton.classList.toggle("armed", armed);
    }
    // In der Einfangphase, damit Tasten, die das Ereignis selbst abfangen, trotzdem zurücksetzen.
    document.addEventListener("pointerdown", event => {
      if (armed && !fullscreenButton.contains(event.target)) setArmed(false);
    }, true);
    fullscreenButton.addEventListener("pointerdown", event => event.preventDefault());
    fullscreenButton.addEventListener("pointerup", () => {
      if (armed) window.close();
      else setArmed(true);
    });
    setArmed(false);
    return;
  }

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
        // L10: Die ganze Seite ins Vollbild, damit die Drehung von #app wirkt (der Browser hebt
        // `transform` am Vollbild-Element auf), dann das Querformat sperren, wo es geht.
        await document.documentElement.requestFullscreen();
        await lockLandscape();
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
