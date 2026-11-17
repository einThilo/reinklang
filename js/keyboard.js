/* ============================================================
   KEYBOARD CLASS
   ============================================================ */

export class Keyboard {
  constructor(options) {
    this.container = options.container;
    this.startMidi = options.startMidi ?? 60;
    this.keyCount = options.keyCount ?? 24;
    // Verschiebt die Farben (weiß/schwarz) gegenüber den klingenden Tönen.
    this.transposeOffset = options.transposeOffset ?? 0;
    // Prototyp S11.1 (`?rand=ganz`): schwarze Tasten am Rand des Bereichs ganz zeigen.
    this.fullEdgeKeys = options.fullEdgeKeys ?? false;

    this.keys = [];
    this.keyElements = new Map();

    // Markierungen, die beim Neuaufbau der Tasten wieder gesetzt werden.
    this.heldMidis = new Set();
    this.activeMidis = new Set();
    this.highlightedMidi = null;

    this.rootElement = document.createElement("div");
    this.rootElement.className = "keyboard";
    this.container.appendChild(this.rootElement);

    this.createKeys();
    this.layoutKeys();
  }

  getNoteName(midi) {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const note = noteNames[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return note + octave;
  }

  isWhiteKey(midi) {
    const offsetMidi = midi - this.transposeOffset;
    const whiteIndices = [0, 2, 4, 5, 7, 9, 11];
    return whiteIndices.includes(((offsetMidi % 12) + 12) % 12);
  }

  setRange({
    startMidi = this.startMidi,
    keyCount = this.keyCount,
    transposeOffset = this.transposeOffset
  } = {}) {
    const nextStartMidi = clamp(Math.round(startMidi), 0, 127);
    const maxKeyCount = 128 - nextStartMidi;
    const nextKeyCount = clamp(Math.round(keyCount), 1, maxKeyCount);

    this.startMidi = nextStartMidi;
    this.keyCount = nextKeyCount;
    this.transposeOffset = transposeOffset;

    this.createKeys();
    this.layoutKeys();
  }

  createKeys() {
    this.rootElement.innerHTML = "";
    this.keys = [];
    this.keyElements.clear();

    for (let index = 0; index < this.keyCount; index++) {
      const midi = this.startMidi + index;
      if (midi < 0 || midi > 127) continue;

      const key = {
        midi,
        isWhite: this.isWhiteKey(midi)
      };

      this.keys.push(key);

      const keyElement = document.createElement("div");
      keyElement.className = `key ${key.isWhite ? "white" : "black"}`;
      keyElement.dataset.midi = String(midi);

      const label = document.createElement("div");
      label.className = "key-label";
      label.textContent = this.getNoteName(midi);

      keyElement.appendChild(label);
      this.rootElement.appendChild(keyElement);
      this.keyElements.set(midi, keyElement);
      this.applyMarks(midi);
    }
  }

  // Setzt die Markierungen einer Taste nach dem gemerkten Stand.
  applyMarks(midi) {
    const element = this.keyElements.get(midi);
    if (!element) return;
    element.classList.toggle("held", this.heldMidis.has(midi));
    element.classList.toggle("active", this.activeMidis.has(midi) || this.highlightedMidi === midi);
  }

  layoutKeys() {
    const positions = keyPositions(this.keys, this.fullEdgeKeys);

    this.keys.forEach((key, index) => {
      const element = this.keyElements.get(key.midi);
      if (!element || !positions[index]) return;

      element.style.left = positions[index].left + "%";
      element.style.width = positions[index].width + "%";
      // Höhe der schwarzen Tasten steht in style.css (--black-key-height).
      if (key.isWhite) element.style.height = "100%";
    });
  }

  onPointerNote(callback) {
    this.rootElement.style.touchAction = "none";

    const pointerToMidi = new Map();

    const emit = (type, midi, pointerId) => {
      callback({
        type,
        midi,
        pointerId
      });
    };

    const midiFromPoint = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      const keyEl = hit?.closest(".key");
      if (!keyEl || !this.rootElement.contains(keyEl)) return null;
      return Number(keyEl.dataset.midi);
    };

    this.rootElement.addEventListener("pointerdown", event => {
      const element = event.target.closest(".key");
      if (!element || !this.rootElement.contains(element)) return;

      event.preventDefault();

      try {
        this.rootElement.setPointerCapture(event.pointerId);
      } catch {}

      const midi = Number(element.dataset.midi);
      pointerToMidi.set(event.pointerId, midi);
      emit("down", midi, event.pointerId);
    });

    this.rootElement.addEventListener("pointermove", event => {
      if (!pointerToMidi.has(event.pointerId)) return;

      event.preventDefault();

      const prevMidi = pointerToMidi.get(event.pointerId);
      const nextMidi = midiFromPoint(event.clientX, event.clientY);

      if (prevMidi === nextMidi) return;

      if (prevMidi !== null && prevMidi !== undefined) {
        emit("up", prevMidi, event.pointerId);
      }
      if (nextMidi !== null && nextMidi !== undefined) {
        emit("down", nextMidi, event.pointerId);
      }

      pointerToMidi.set(event.pointerId, nextMidi);
    });

    const finish = event => {
      if (!pointerToMidi.has(event.pointerId)) return;

      const midi = pointerToMidi.get(event.pointerId);
      if (midi !== null && midi !== undefined) {
        emit("up", midi, event.pointerId);
      }

      pointerToMidi.delete(event.pointerId);

      try {
        this.rootElement.releasePointerCapture(event.pointerId);
      } catch {}
    };

    this.rootElement.addEventListener("pointerup", finish);
    this.rootElement.addEventListener("pointercancel", finish);
    this.rootElement.addEventListener("lostpointercapture", finish);
  }

  setHeldState(midi, held) {
    if (held) this.heldMidis.add(midi);
    else this.heldMidis.delete(midi);
    this.applyMarks(midi);
  }

  setActiveState(midi, active) {
    if (active) this.activeMidis.add(midi);
    else this.activeMidis.delete(midi);
    this.applyMarks(midi);
  }

  highlightHarmonyKey(midi) {
    const previous = this.highlightedMidi;
    this.highlightedMidi = midi;
    if (previous !== null) this.applyMarks(previous);
    this.applyMarks(midi);
  }
}

// Lage und Breite der Tasten in Prozent der Klaviaturbreite, in der Reihenfolge von `keys`.
// Weiße Tasten teilen die Breite unter sich auf; eine schwarze Taste ist 0,9 weiße Tasten breit und
// sitzt mittig auf der Grenze zur nächsten weißen. Am Rand des Bereichs ragt sie deshalb zur Hälfte
// hinaus, und ohne weiße Taste gibt es keine Lage (leere Liste).
// Mit `fullEdgeKeys` (Prototyp S11.1) bleibt am Rand Platz für die ganze schwarze Taste.
export function keyPositions(keys, fullEdgeKeys = false) {
  const whiteCount = keys.filter(key => key.isWhite).length;
  const edge = key => (fullEdgeKeys && key && !key.isWhite ? 0.45 : 0);
  const offset = edge(keys[0]);
  const total = whiteCount + offset + edge(keys[keys.length - 1]);

  if (total === 0) return [];

  let whiteIndex = 0;
  return keys.map(key => {
    if (key.isWhite) {
      const position = { left: ((offset + whiteIndex) / total) * 100, width: (1 / total) * 100 };
      whiteIndex++;
      return position;
    }
    return { left: ((offset + whiteIndex - 0.45) / total) * 100, width: (0.9 / total) * 100 };
  });
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
