import { test } from "node:test";
import assert from "node:assert/strict";
import { SynthController, pickAutoRoot, connectAutoRoot } from "../js/player.js";
import { state, setState, setStates } from "../js/state.js";

// Attrappen für Klaviatur und Klang; `log` hält die Aufrufe an den Klang in Reihenfolge fest.
function createSynth() {
  const log = [];
  const held = new Map();
  const active = new Map();
  const keyboard = {
    setHeldState: (midi, value) => held.set(midi, value),
    setActiveState: (midi, value) => active.set(midi, value)
  };
  // Der Platz wird nur vermerkt, wenn es die Spielstimme ist (K6).
  const audioEngine = {
    noteOn: (midi, frequency, platz = "halte") =>
      log.push(platz === "halte" ? ["noteOn", midi, frequency] : ["noteOn", midi, frequency, platz]),
    noteOff: (midi, platz = "halte") => log.push(platz === "halte" ? ["noteOff", midi] : ["noteOff", midi, platz]),
    promoteSpiel: midi => log.push(["promoteSpiel", midi])
  };
  const synth = new SynthController(keyboard, audioEngine, midi => midi * 10);
  return { synth, log, held, active };
}

// --- pickAutoRoot ---

test("pickAutoRoot „Tiefster“: tiefster klingender Ton, ohne Töne keine Änderung", () => {
  assert.equal(pickAutoRoot("lowest", [64, 60, 67], 2), 60);
  assert.equal(pickAutoRoot("lowest", [], 1), null);
});

test("pickAutoRoot „Erster“: nur der erste Ton nach Stille", () => {
  assert.equal(pickAutoRoot("first", [64], 0), 64);
  assert.equal(pickAutoRoot("first", [64, 60], 1), null);
  assert.equal(pickAutoRoot("first", [], 0), null);
});

test("pickAutoRoot „Manuell“: nie eine Änderung", () => {
  assert.equal(pickAutoRoot("manual", [64, 60], 0), null);
});

// --- SynthController ---

test("Drücken schlägt den Ton mit seiner Frequenz an, Loslassen beendet ihn", () => {
  const { synth, log, active } = createSynth();

  synth.handlePointerEvent("down", 60);
  assert.deepEqual(log, [["noteOn", 60, 600]]);
  assert.deepEqual([...synth.activeNotes], [60]);
  assert.equal(active.get(60), true);

  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600], ["noteOff", 60]]);
  assert.deepEqual([...synth.activeNotes], []);
  assert.equal(active.get(60), false);
});

test("Loslassen ohne vorheriges Drücken bewirkt nichts", () => {
  const { synth, log } = createSynth();
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, []);
});

test("zwei Finger auf derselben Taste: Ton endet erst, wenn beide los sind", () => {
  const { synth, log } = createSynth();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.equal(log.filter(entry => entry[0] === "noteOff").length, 0);
  synth.handlePointerEvent("up", 60);
  assert.equal(log.filter(entry => entry[0] === "noteOff").length, 1);
});

test("erst melden, dann anschlagen (A2), und je Anschlag genau eine Meldung", () => {
  const { synth } = createSynth();
  const order = [];
  synth.onNotesChanged = () => order.push("gemeldet:" + [...synth.activeNotes].join(","));
  synth.audioEngine.noteOn = midi => order.push("noteOn:" + midi);

  synth.handlePointerEvent("down", 60);

  assert.deepEqual(order, ["gemeldet:60", "noteOn:60"]);
});

test("Loslassen meldet genau einmal, nach dem Beenden des Tons", () => {
  const { synth } = createSynth();
  synth.handlePointerEvent("down", 60);
  const order = [];
  synth.onNotesChanged = () => order.push("gemeldet:" + synth.activeNotes.size);
  synth.audioEngine.noteOff = midi => order.push("noteOff:" + midi);

  synth.handlePointerEvent("up", 60);

  assert.deepEqual(order, ["noteOff:60", "gemeldet:0"]);
});

test("Sustain: Tippen hält den Ton, erneutes Tippen beendet ihn", () => {
  const { synth, log, held } = createSynth();
  synth.setSustainEnabled(true);

  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600]]);
  assert.equal(held.get(60), true);

  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600], ["noteOff", 60]]);
  assert.equal(held.get(60), false);
});

test("Release beendet gehaltene Töne, aber keine noch gedrückten", () => {
  const { synth, log } = createSynth();
  let notifications = 0;

  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("down", 64);
  synth.pedalDown();
  assert.equal(synth.pedalUp(), "hold");
  synth.handlePointerEvent("up", 60);

  synth.onNotesChanged = () => notifications++;
  synth.releaseAllHeldKeys();

  assert.deepEqual(log.filter(entry => entry[0] === "noteOff"), [["noteOff", 60]]);
  assert.deepEqual([...synth.activeNotes], [64]);
  assert.equal(notifications, 1);

  synth.handlePointerEvent("up", 64);
  assert.deepEqual([...synth.activeNotes], []);
});

// --- Pedal (W4.2) ---

test("Pedal: angeschlagene Töne klingen nach dem Loslassen der Taste weiter und enden mit dem Pedal", () => {
  const { synth, log, held } = createSynth();
  synth.pedalDown();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600]]);
  assert.equal(held.get(60), true);

  assert.equal(synth.pedalUp(), "pedal");
  assert.deepEqual(log, [["noteOn", 60, 600], ["noteOff", 60]]);
  assert.equal(held.get(60), false);
});

test("Pedal: eine noch gedrückte Taste klingt nach dem Loslassen des Pedals weiter", () => {
  const { synth, log } = createSynth();
  synth.pedalDown();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("down", 64);
  synth.handlePointerEvent("up", 60);
  assert.equal(synth.pedalUp(), "pedal");
  assert.deepEqual(log, [["noteOn", 60, 600], ["noteOn", 64, 640], ["noteOff", 60]]);

  synth.handlePointerEvent("up", 64);
  assert.deepEqual(log.at(-1), ["noteOff", 64]);
});

test("Pedal: erneuter Anschlag eines Pedal-Tons schlägt neu an, statt ihn zu beenden", () => {
  const { synth, log } = createSynth();
  synth.pedalDown();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600], ["noteOn", 60, 600]]);
});

test("Pedal ohne Anschlag, keine Taste gedrückt: Ergebnis „toggle“, nichts klingt", () => {
  const { synth, log } = createSynth();
  synth.pedalDown();
  assert.equal(synth.pedalUp(), "toggle");
  assert.deepEqual(log, []);
});

test("Pedal ohne Änderung bei gedrückten Tasten: sie werden gehalten wie bei S3", () => {
  const { synth, log, held } = createSynth();
  synth.handlePointerEvent("down", 60);
  synth.pedalDown();
  assert.equal(synth.pedalUp(), "hold");
  assert.equal(held.get(60), true);

  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600]]);

  synth.releaseAllHeldKeys();
  assert.deepEqual(log.at(-1), ["noteOff", 60]);
});

test("Pedal mit nur Loslassen (W4.2): Ton klingt weiter und endet mit dem Pedal", () => {
  const { synth, log, held } = createSynth();
  synth.handlePointerEvent("down", 60);
  synth.pedalDown();
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600]]);
  assert.equal(held.get(60), true);

  assert.equal(synth.pedalUp(), "pedal");
  assert.deepEqual(log, [["noteOn", 60, 600], ["noteOff", 60]]);
  assert.equal(held.get(60), false);
});

test("Pedal mit Anschlag: auch die beim Treten gedrückten Tasten enden, früher gehaltene Töne bleiben", () => {
  const { synth, log } = createSynth();
  synth.setSustainEnabled(true);
  synth.handlePointerEvent("down", 48);
  synth.handlePointerEvent("up", 48);
  synth.setSustainEnabled(false);
  synth.handlePointerEvent("down", 60);

  synth.pedalDown();
  synth.handlePointerEvent("up", 60);
  synth.handlePointerEvent("down", 64);
  synth.handlePointerEvent("up", 64);
  assert.equal(synth.pedalUp(), "pedal");

  assert.deepEqual([...synth.activeNotes], [48]);
});

test("Pedal bei eingeschaltetem Sustain: Anschläge zählen als gedrückte Tasten, nicht als Umschalten", () => {
  const { synth } = createSynth();
  synth.setSustainEnabled(true);
  synth.pedalDown();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.equal(synth.isHeld[60], false);
  assert.equal(synth.pedalUp(), "pedal");
  assert.deepEqual([...synth.activeNotes], []);
});

test("Pedal meldet Tonänderungen beim Loslassen genau einmal", () => {
  const { synth } = createSynth();
  synth.pedalDown();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("down", 64);
  synth.handlePointerEvent("up", 60);
  synth.handlePointerEvent("up", 64);
  let notifications = 0;
  synth.onNotesChanged = () => notifications++;
  synth.pedalUp();
  assert.equal(notifications, 1);
});

// --- Mehrere Stimmen je Taste (K6) ---

// Hält Taste 60 per Sustain-Tipp und schaltet Sustain wieder aus; das Protokoll beginnt danach leer.
function heldSynth() {
  const created = createSynth();
  created.synth.setSustainEnabled(true);
  created.synth.handlePointerEvent("down", 60);
  created.synth.handlePointerEvent("up", 60);
  created.synth.setSustainEnabled(false);
  created.log.length = 0;
  return created;
}

test("K6 Regel 1: gehaltene Taste erneut drücken bringt eine Spielstimme, die beim Loslassen endet", () => {
  const { synth, log } = heldSynth();
  synth.handlePointerEvent("down", 60);
  assert.deepEqual(log, [["noteOn", 60, 600, "spiel"]]);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600, "spiel"], ["noteOff", 60, "spiel"]]);
  assert.deepEqual([...synth.activeNotes], [60]);
});

test("K6 Regel 2: erneutes Drücken schlägt die Spielstimme neu an, auch mit zweitem Finger", () => {
  const { synth, log } = heldSynth();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("down", 60);
  assert.deepEqual(log, [
    ["noteOn", 60, 600, "spiel"], ["noteOff", 60, "spiel"],
    ["noteOn", 60, 600, "spiel"], ["noteOn", 60, 600, "spiel"]
  ]);
});

test("K6 Regel 3: Release beendet nur die Haltestimme, die Spielstimme klingt bis zum Loslassen", () => {
  const { synth, log } = heldSynth();
  synth.handlePointerEvent("down", 60);
  synth.releaseAllHeldKeys();
  assert.deepEqual(log.at(-1), ["noteOff", 60]);
  assert.deepEqual([...synth.activeNotes], [60]);

  synth.handlePointerEvent("down", 60);           // zweiter Finger: Spielstimme neu angeschlagen
  assert.deepEqual(log.at(-1), ["noteOn", 60, 600, "spiel"]);
  synth.handlePointerEvent("up", 60);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log.at(-1), ["noteOff", 60, "spiel"]);
  assert.deepEqual([...synth.activeNotes], []);

  synth.handlePointerEvent("down", 60);           // danach wieder ein gewöhnlicher Ton
  assert.deepEqual(log.at(-1), ["noteOn", 60, 600]);
});

test("K6 Regel 5: Pedal und Druck auf gehaltene Taste – Spielstimme bis Pedal-Loslassen, Haltestimme bleibt", () => {
  const { synth, log } = heldSynth();
  synth.pedalDown();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600, "spiel"]]);
  assert.equal(synth.pedalUp(), "pedal");
  assert.deepEqual(log, [["noteOn", 60, 600, "spiel"], ["noteOff", 60, "spiel"]]);
  assert.equal(synth.isHeld[60], true);
});

test("K6 Regel 5: Pedal zuerst losgelassen – Spielstimme bis Tasten-Loslassen", () => {
  const { synth, log } = heldSynth();
  synth.pedalDown();
  synth.handlePointerEvent("down", 60);
  synth.pedalUp();
  assert.deepEqual(log, [["noteOn", 60, 600, "spiel"]]);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600, "spiel"], ["noteOff", 60, "spiel"]]);
});

test("K6 Regel 6: Sustain an, Druck auf gehaltene Taste beendet die Haltestimme, keine Spielstimme", () => {
  const { synth, log } = heldSynth();
  synth.setSustainEnabled(true);
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOff", 60]]);
  assert.deepEqual([...synth.activeNotes], []);
});

test("K6 Regel 7: Sustain-Tipp hält die Spielstimme; sie wird Haltestimme, die bisherige klingt aus", () => {
  const { synth, log } = heldSynth();
  synth.handlePointerEvent("down", 60);
  synth.pedalDown();
  assert.equal(synth.pedalUp(), "hold");
  assert.deepEqual(log, [["noteOn", 60, 600, "spiel"], ["promoteSpiel", 60]]);

  synth.handlePointerEvent("up", 60);
  assert.equal(log.length, 2);                    // klingt als Haltestimme weiter
  synth.releaseAllHeldKeys();
  assert.deepEqual(log.at(-1), ["noteOff", 60]);
  assert.deepEqual([...synth.activeNotes], []);
});

test("K6 Regel 7 nach Release: die Spielstimme wird wieder Haltestimme", () => {
  const { synth, log } = heldSynth();
  synth.handlePointerEvent("down", 60);
  synth.releaseAllHeldKeys();
  synth.pedalDown();
  assert.equal(synth.pedalUp(), "hold");
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(log, [["noteOn", 60, 600, "spiel"], ["noteOff", 60], ["promoteSpiel", 60]]);
  assert.deepEqual([...synth.activeNotes], [60]);
});

test("K6: Spielstimme beginnen und beenden ändert die klingenden Töne nicht", () => {
  const { synth } = heldSynth();
  const reports = [];
  synth.onNotesChanged = () => reports.push([...synth.activeNotes]);
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.ok(reports.every(notes => notes.length === 1 && notes[0] === 60));
});

// --- connectAutoRoot ---
// Diese Tests teilen sich das eine `state`-Objekt und laufen der Reihe nach.

test("connectAutoRoot „Erster“: erster Ton nach Stille wird Grundton", () => {
  setState("useTuning", true);
  const { synth } = createSynth();
  connectAutoRoot(synth);
  setState("harmonyMode", "first");

  synth.handlePointerEvent("down", 64);
  assert.equal(state.rootMidi, 64);

  synth.handlePointerEvent("down", 60);
  assert.equal(state.rootMidi, 64);

  synth.handlePointerEvent("up", 64);
  synth.handlePointerEvent("up", 60);
  synth.handlePointerEvent("down", 62);
  assert.equal(state.rootMidi, 62);
});

test("connectAutoRoot „Tiefster“: wirkt sofort beim Umschalten und bei jedem neuen Ton", () => {
  const { synth } = createSynth();
  connectAutoRoot(synth);
  setState("harmonyMode", "first");

  synth.handlePointerEvent("down", 67);
  synth.handlePointerEvent("down", 64);
  assert.equal(state.rootMidi, 67);

  setState("harmonyMode", "lowest");
  assert.equal(state.rootMidi, 64);

  synth.handlePointerEvent("down", 60);
  assert.equal(state.rootMidi, 60);

  synth.handlePointerEvent("up", 60);
  assert.equal(state.rootMidi, 64);
});

test("connectAutoRoot: der Grundton steht fest, bevor die Frequenz des neuen Tons berechnet wird (A2)", () => {
  const { synth } = createSynth();
  connectAutoRoot(synth);
  setState("harmonyMode", "lowest");
  setState("rootMidi", 72);
  let rootAtFrequency = null;
  synth.frequencyOf = midi => {
    rootAtFrequency = state.rootMidi;
    return midi * 10;
  };

  synth.handlePointerEvent("down", 50);

  assert.equal(rootAtFrequency, 50);
});

test("connectAutoRoot „Manuell“: Grundton bleibt", () => {
  const { synth } = createSynth();
  connectAutoRoot(synth);
  setState("harmonyMode", "manual");
  setState("rootMidi", 65);

  synth.handlePointerEvent("down", 50);

  assert.equal(state.rootMidi, 65);
});

test("connectAutoRoot: sucht nur bei eingeschaltetem Tuning, „Tiefster“ sofort beim Einschalten (L7)", () => {
  const { synth } = createSynth();
  connectAutoRoot(synth);
  setStates({ harmonyMode: "lowest", rootMidi: 70, useTuning: false });

  synth.handlePointerEvent("down", 55);
  assert.equal(state.rootMidi, 70);

  setState("useTuning", true);
  assert.equal(state.rootMidi, 55);
});

test("connectAutoRoot: „Erster“ wartet nach dem Einschalten auf den nächsten Anschlag nach Stille (L7)", () => {
  const { synth } = createSynth();
  connectAutoRoot(synth);
  setStates({ harmonyMode: "first", rootMidi: 70, useTuning: false });

  synth.handlePointerEvent("down", 57);
  setState("useTuning", true);
  assert.equal(state.rootMidi, 70);

  synth.handlePointerEvent("up", 57);
  synth.handlePointerEvent("down", 59);
  assert.equal(state.rootMidi, 59);
});

test("onHeldChanged meldet gehaltene Tasten nur bei Änderung; Pedal-Töne zählen nicht (W6)", () => {
  const { synth } = createSynth();
  const reports = [];
  synth.onHeldChanged = value => reports.push(value);

  synth.pedalDown();
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("up", 60);
  assert.deepEqual(reports, []);
  synth.pedalUp();

  synth.setSustainEnabled(true);
  synth.handlePointerEvent("down", 60);
  synth.handlePointerEvent("down", 64);
  assert.deepEqual(reports, [true]);

  synth.releaseAllHeldKeys();
  assert.deepEqual(reports, [true, false]);
});
