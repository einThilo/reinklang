import { state, setState, onStateChange } from "./state.js";

export class SynthController {
  constructor(keyboard, audioEngine, frequencyOf) {
    this.keyboard = keyboard;
    this.audioEngine = audioEngine;
    this.frequencyOf = frequencyOf;

    this.physicalPresses = new Array(128).fill(0);
    this.isHeld = new Array(128).fill(false);
    this.sustainEnabled = false;

    // Pedal (W4.2, Sustain-Button gedrückt): Solange es getreten ist, klingen die Töne in
    // `pedalNotes` auch ohne gedrückte Taste weiter. `pedalUsed`: ein Tastenzustand hat sich geändert.
    this.pedalActive = false;
    this.pedalUsed = false;
    this.pedalNotes = new Set();

    this.activeNotes = new Set();
    this.onNotesChanged = () => {};
  }

  setSustainEnabled(enabled) {
    this.sustainEnabled = enabled;
  }

  // Pedal treten: Die gerade gedrückten Tasten gehören von Anfang an dazu.
  pedalDown() {
    this.pedalActive = true;
    this.pedalUsed = false;
    for (let midi = 0; midi < 128; midi++) {
      if (this.physicalPresses[midi] > 0) this.addPedalNote(midi);
    }
  }

  // Pedal loslassen. Liefert, was daraus wurde:
  // "pedal"  – währenddessen wurde eine Taste angeschlagen oder losgelassen: alle Pedal-Töne ohne
  //            gedrückte Taste enden; Sustain bleibt, wie es war;
  // "hold"   – keine Änderung, Sustain aus, Tasten waren beim Treten gedrückt: sie werden gehalten (wie S3);
  // "toggle" – keine Änderung, sonst: der Aufrufer schaltet Sustain um.
  pedalUp() {
    const notes = Array.from(this.pedalNotes);
    const result = this.pedalUsed ? "pedal" : (!this.sustainEnabled && notes.length > 0 ? "hold" : "toggle");

    this.pedalActive = false;
    this.pedalUsed = false;
    this.pedalNotes.clear();

    let changed = false;
    for (const midi of notes) {
      if (result === "hold") this.isHeld[midi] = true;
      if (this.evaluateNoteStateInternal(midi)) changed = true;
      this.updateKeyboardVisuals(midi);
    }
    if (changed) this.onNotesChanged();
    return result;
  }

  addPedalNote(midi) {
    this.pedalNotes.add(midi);
    this.updateKeyboardVisuals(midi);
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
      if (this.pedalActive) {
        // Bei getretenem Pedal zählt jeder Anschlag als gedrückte Taste, auch wenn Sustain an ist.
        this.physicalPresses[midi]++;
        this.pedalNotes.add(midi);
        this.pedalUsed = true;
      } else if (this.sustainEnabled) {
        this.isHeld[midi] = !this.isHeld[midi];
      } else {
        this.physicalPresses[midi]++;
      }
      this.evaluateNoteState(midi, true);
      this.updateKeyboardVisuals(midi);
    } else if (type === "up") {
      if (this.pedalActive) this.pedalUsed = true;
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
    const shouldSound = this.physicalPresses[midi] > 0 || this.isHeld[midi] || this.pedalNotes.has(midi);


    if (shouldSound) {
      if (!this.activeNotes.has(midi) || forceTrigger) {
        this.activeNotes.add(midi);
        // Erst melden, dann anschlagen: Die Grundton-Automatik legt so den Grundton fest,
        // bevor die Frequenz des neuen Tons berechnet wird. Deshalb hier kein `changed`,
        // sonst würde der Aufrufer ein zweites Mal melden.
        this.onNotesChanged();
        this.audioEngine.noteOn(midi, this.frequencyOf(midi));
      }
    } else if (this.activeNotes.has(midi)) {
      this.activeNotes.delete(midi);
      this.audioEngine.noteOff(midi);
      changed = true;
    }
    
    return changed;
  }

  updateKeyboardVisuals(midi) {
    this.keyboard.setHeldState(midi, this.isHeld[midi] || this.pedalNotes.has(midi));
    this.keyboard.setActiveState(midi, this.physicalPresses[midi] > 0);
  }
}

// Grundton-Automatik: liefert den neuen Grundton oder null (keine Änderung).
export function pickAutoRoot(mode, activeNotes, previousCount) {
  if (mode === "lowest" && activeNotes.length > 0) {
    return Math.min(...activeNotes);
  }
  if (mode === "first" && previousCount === 0 && activeNotes.length > 0) {
    return activeNotes[0];
  }
  return null;
}

// Verbindet die Grundton-Automatik mit einem SynthController: Bei jeder Änderung der
// klingenden Töne, bei jedem Wechsel des Harmoniemodus und beim Einschalten des Tunings wird die
// Regel befragt. Bei ausgeschaltetem Tuning bleibt der Grundton, wie er ist (L7).
export function connectAutoRoot(synth) {
  let previousCount = 0;

  function update() {
    const activeNotes = Array.from(synth.activeNotes);
    const newRoot = pickAutoRoot(state.harmonyMode, activeNotes, previousCount);

    if (newRoot !== null && state.useTuning) setState("rootMidi", newRoot);

    previousCount = activeNotes.length;
  }

  synth.onNotesChanged = update;

  onStateChange(key => {
    if (key === "harmonyMode" || key === "useTuning") update();
  });
}
