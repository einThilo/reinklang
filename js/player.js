import { state, setState, onStateChange } from "./state.js";

export class SynthController {
  constructor(keyboard, audioEngine, frequencyOf) {
    this.keyboard = keyboard;
    this.audioEngine = audioEngine;
    this.frequencyOf = frequencyOf;

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

  // Nimmt die gerade gedrückten Tasten zu den gehaltenen auf; liefert, ob es welche gab.
  holdPressedKeys() {
    let found = false;
    for (let midi = 0; midi < 128; midi++) {
      if (this.physicalPresses[midi] > 0) {
        this.isHeld[midi] = true;
        this.updateKeyboardVisuals(midi);
        found = true;
      }
    }
    return found;
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
        this.audioEngine.noteOn(midi, this.frequencyOf(midi));
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
// klingenden Töne und bei jedem Wechsel des Harmoniemodus wird die Regel befragt.
export function connectAutoRoot(synth) {
  let previousCount = 0;

  function update() {
    const activeNotes = Array.from(synth.activeNotes);
    const newRoot = pickAutoRoot(state.harmonyMode, activeNotes, previousCount);

    if (newRoot !== null) setState("rootMidi", newRoot);

    previousCount = activeNotes.length;
  }

  synth.onNotesChanged = update;

  onStateChange(key => {
    if (key === "harmonyMode") update();
  });
}
