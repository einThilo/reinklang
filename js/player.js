import { state, setState, onStateChange } from "./state.js";

export class SynthController {
  constructor(keyboard, audioEngine, frequencyOf) {
    this.keyboard = keyboard;
    this.audioEngine = audioEngine;
    this.frequencyOf = frequencyOf;

    this.physicalPresses = new Array(128).fill(0);
    this.isHeld = new Array(128).fill(false);

    // K6: Je Taste eine Haltestimme (Platz „halte“, auch für gewöhnlich gespielte Töne) und eine
    // Spielstimme (Platz „spiel“) beim erneuten Drücken einer gehaltenen Taste. `spielMode`: der
    // laufende Druck gehört zur Spielstimme. `halteOn`/`spielOn`: die Stimme ist angeschlagen
    // und noch nicht losgelassen.
    this.spielMode = new Array(128).fill(false);
    this.halteOn = new Array(128).fill(false);
    this.spielOn = new Array(128).fill(false);
    this.sustainEnabled = false;

    // Pedal (W4.2, Sustain-Button gedrückt): Solange es getreten ist, klingen die Töne in
    // `pedalNotes` auch ohne gedrückte Taste weiter. `pedalUsed`: ein Tastenzustand hat sich geändert.
    this.pedalActive = false;
    this.pedalUsed = false;
    this.pedalNotes = new Set();

    this.activeNotes = new Set();
    this.onNotesChanged = () => {};

    // Meldet, ob es gehaltene Tasten gibt (also Release etwas beenden würde), nur bei Änderung (W6).
    // Töne, die nur das getretene Pedal hält, zählen nicht.
    this.hasHeld = false;
    this.onHeldChanged = () => {};
  }

  hasHeldKeys() {
    return this.isHeld.some(Boolean);
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
      if (result === "hold") {
        this.isHeld[midi] = true;
        // Regel 7: Die gehaltene Spielstimme wird die neue Haltestimme, die bisherige klingt aus.
        if (this.spielOn[midi]) {
          this.audioEngine.promoteSpiel(midi);
          this.halteOn[midi] = true;
          this.spielOn[midi] = false;
          this.spielMode[midi] = false;
        }
      }
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

  // Vergisst alle gedrückten Tasten, als wären sie losgelassen worden (S18, S19): für Finger, deren
  // Loslassen nie ankam. Gehaltene Töne klingen weiter, ein getretenes Pedal bleibt mit seinen Tönen.
  forgetPresses() {
    let changed = false;
    for (let midi = 0; midi < 128; midi++) {
      if (this.physicalPresses[midi] === 0 && !this.spielMode[midi]) continue;
      this.physicalPresses[midi] = 0;
      if (!this.pedalNotes.has(midi)) this.spielMode[midi] = false;
      if (this.evaluateNoteStateInternal(midi)) changed = true;
      this.updateKeyboardVisuals(midi);
    }
    if (changed) this.onNotesChanged();
  }

  handlePointerEvent(type, midi) {
    if (type === "down") {
      let trigger;
      if (this.pedalActive) {
        // Bei getretenem Pedal zählt jeder Anschlag als gedrückte Taste, auch wenn Sustain an ist.
        this.physicalPresses[midi]++;
        this.pedalNotes.add(midi);
        this.pedalUsed = true;
        trigger = this.startsSpiel(midi);                    // Regel 5
      } else if (this.sustainEnabled) {
        this.isHeld[midi] = !this.isHeld[midi];              // Regel 6: keine Spielstimme
        trigger = this.isHeld[midi] ? "halte" : null;
      } else {
        this.physicalPresses[midi]++;
        trigger = this.startsSpiel(midi);                    // Regeln 1 und 2
      }
      this.evaluateNoteState(midi, trigger);
      this.updateKeyboardVisuals(midi);
    } else if (type === "up") {
      if (this.pedalActive) this.pedalUsed = true;
      if (this.physicalPresses[midi] > 0) {
        this.physicalPresses[midi]--;
      }
      this.evaluateNoteState(midi);
      this.updateKeyboardVisuals(midi);
    }
  }

  // Ein Druck auf eine gehaltene Taste, oder während eine Spielstimme läuft, gehört zur Spielstimme.
  startsSpiel(midi) {
    if (this.isHeld[midi] || this.spielMode[midi]) {
      this.spielMode[midi] = true;
      return "spiel";
    }
    return "halte";
  }

  evaluateNoteState(midi, trigger = null) {
    if (this.evaluateNoteStateInternal(midi, trigger)) {
      this.onNotesChanged();
    }
  }

  // Bringt die Stimmen der Taste in den Soll-Zustand. `trigger`: dieser Platz wird (neu) angeschlagen.
  // Die Spielstimme klingt, solange die Taste gedrückt oder (bei getretenem Pedal) Pedal-Ton ist;
  // die Haltestimme, solange die Taste gehalten ist oder ohne Spielstimme gedrückt/Pedal-Ton ist.
  evaluateNoteStateInternal(midi, trigger = null) {
    const pressed = this.physicalPresses[midi] > 0 || this.pedalNotes.has(midi);
    if (!pressed) this.spielMode[midi] = false;
    const wantSpiel = this.spielMode[midi];
    const wantHalte = this.isHeld[midi] || (!wantSpiel && pressed);
    const wasActive = this.activeNotes.has(midi);
    const nowActive = wantHalte || wantSpiel;

    if (nowActive && (!wasActive || trigger)) {
      this.activeNotes.add(midi);
      // Erst melden, dann anschlagen: Die Grundton-Automatik legt so den Grundton fest,
      // bevor die Frequenz des neuen Tons berechnet wird. Deshalb hier kein `changed`,
      // sonst würde der Aufrufer ein zweites Mal melden.
      this.onNotesChanged();
    }

    if (!wantSpiel && this.spielOn[midi]) {
      this.audioEngine.noteOff(midi, "spiel");
      this.spielOn[midi] = false;
    }
    if (!wantHalte && this.halteOn[midi]) {
      this.audioEngine.noteOff(midi, "halte");
      this.halteOn[midi] = false;
    }
    if (wantHalte && (!this.halteOn[midi] || trigger === "halte")) {
      this.audioEngine.noteOn(midi, this.frequencyOf(midi), "halte");
      this.halteOn[midi] = true;
    }
    if (wantSpiel && (!this.spielOn[midi] || trigger === "spiel")) {
      this.audioEngine.noteOn(midi, this.frequencyOf(midi), "spiel");
      this.spielOn[midi] = true;
    }

    if (!nowActive && wasActive) {
      this.activeNotes.delete(midi);
      return true;
    }
    return false;
  }

  updateKeyboardVisuals(midi) {
    this.keyboard.setHeldState(midi, this.isHeld[midi] || this.pedalNotes.has(midi));
    this.keyboard.setActiveState(midi, this.physicalPresses[midi] > 0);

    const hasHeld = this.hasHeldKeys();
    if (hasHeld !== this.hasHeld) {
      this.hasHeld = hasHeld;
      this.onHeldChanged(hasHeld);
    }
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
