/* ============================================================
   COMPUTERTASTATUR (Z10)
   ============================================================ */

// Codes nach der Lage der Taste (`event.code`), unabhängig vom Tastaturlayout. Auf der deutschen
// Tastatur: `a s d f g h j k l ö ä #` und darüber `q w e r t z u i o p ü +`.
export const WHITE_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL",
  "Semicolon", "Quote", "Backslash"];
export const BLACK_CODES = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO",
  "KeyP", "BracketLeft", "BracketRight"];

// Belegung Code → Ton für die sichtbaren Tasten (`keys` wie Keyboard.keys, aufsteigend, mit Farbe).
// Die erste weiße Code-Taste liegt auf der untersten ganz sichtbaren weißen Taste; eine halb über den Rand
// ragende unterste Taste (`cutEdgeKeys`) zählt dafür nicht. Die schwarze Code-Taste j liegt links von der
// weißen j, wie auf der Tastatur versetzt; wo dort keine schwarze Taste ist (h–c, e–f), bleibt sie stumm.
// Was außerhalb der sichtbaren Tasten läge, bleibt ebenfalls stumm.
export function computerKeyMap(keys, cutEdgeKeys) {
  const map = new Map();
  const byMidi = new Map(keys.map(key => [key.midi, key]));
  const whites = keys.filter((key, index) => key.isWhite && !(cutEdgeKeys && index === 0)).map(key => key.midi);
  const isBlack = midi => byMidi.has(midi) && !byMidi.get(midi).isWhite;

  WHITE_CODES.forEach((code, j) => {
    if (j < whites.length) map.set(code, whites[j]);
  });
  BLACK_CODES.forEach((code, j) => {
    // Links der weißen j; gibt es sie nicht mehr, rechts der letzten weißen.
    const candidate = j < whites.length ? whites[j] - 1 : (j === whites.length && j > 0 ? whites[j - 1] + 1 : null);
    if (candidate !== null && isBlack(candidate)) map.set(code, candidate);
  });
  return map;
}

// Spielen mit der Computertastatur. `getKeys()` liefert die sichtbaren Tasten; `onNote(type, midi)` mit
// "down"/"up"; `onPedal(down)` für die Leertaste (wie der Sustain-Button); `onRelease()` für Escape.
// Gedrückt gehaltene Tasten wiederholen nicht. Steht die Eingabe in einem Feld (Stimmton), spielt nichts.
// Ein losgelassener Code beendet den Ton, den er angeschlagen hat, auch wenn sich der Bereich inzwischen
// verschoben hat. Liefert `anyDown()` und `forget()` (vergisst gedrückte Codes ohne „up“, S18/S19).
export function setupComputerKeys({ target, getKeys, cutEdgeKeys, onNote, onPedal, onRelease }) {
  const down = new Map();   // Code → Ton
  let pedal = false;

  const isTyping = event => {
    const element = event.target;
    return element && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
  };
  const hasModifier = event => event.ctrlKey || event.metaKey || event.altKey;

  target.addEventListener("keydown", event => {
    if (isTyping(event) || hasModifier(event)) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat && !pedal) { pedal = true; onPedal(true); }
      return;
    }
    if (event.code === "Escape") {
      if (!event.repeat) onRelease();
      return;
    }
    const midi = computerKeyMap(getKeys(), cutEdgeKeys).get(event.code);
    if (midi === undefined) {
      // Stumme Codes der Belegung sollen nichts anderes auslösen.
      if (WHITE_CODES.includes(event.code) || BLACK_CODES.includes(event.code)) event.preventDefault();
      return;
    }
    event.preventDefault();
    if (event.repeat || down.has(event.code)) return;
    down.set(event.code, midi);
    onNote("down", midi);
  });

  target.addEventListener("keyup", event => {
    if (event.code === "Space") {
      event.preventDefault();
      if (pedal) { pedal = false; onPedal(false); }
      return;
    }
    if (!down.has(event.code)) return;
    event.preventDefault();
    const midi = down.get(event.code);
    down.delete(event.code);
    onNote("up", midi);
  });

  return {
    anyDown: () => down.size > 0,
    // Ein über die Leertaste getretenes Pedal gilt als losgelassen, sein Loslassen käme nicht mehr an.
    forget: () => {
      down.clear();
      if (pedal) { pedal = false; onPedal(false); }
    }
  };
}
