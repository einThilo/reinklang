import { test } from "node:test";
import assert from "node:assert/strict";
import { state, setState, setStates, onStateChange } from "../js/state.js";

// Die Tests teilen sich das eine `state`-Objekt und laufen der Reihe nach.

test("Startwerte", () => {
  assert.deepEqual(state, {
    rootMidi: 60,
    harmonyMode: "first",
    tuningMode: "thilo",
    customTunings: {},
    useTuning: false,
    a4Frequency: 440,
    transpose: 0,
    instrument: "piano",
    sustain: false,
    keyboardStartMidi: 45,
    keyboardKeyCount: 26
  });
});

test("setState setzt den Wert und meldet Name, neuen und vorherigen Wert", () => {
  const calls = [];
  onStateChange((...args) => calls.push(args));

  setState("a4Frequency", 442);

  assert.equal(state.a4Frequency, 442);
  assert.deepEqual(calls, [["a4Frequency", 442, 440]]);
});

test("setState meldet nicht, wenn sich der Wert nicht ändert", () => {
  const calls = [];
  onStateChange((...args) => calls.push(args));

  setState("a4Frequency", state.a4Frequency);

  assert.deepEqual(calls, []);
});

test("alle Zuhörer werden benachrichtigt, in der Reihenfolge der Anmeldung", () => {
  const order = [];
  onStateChange(key => { if (key === "transpose") order.push("a"); });
  onStateChange(key => { if (key === "transpose") order.push("b"); });

  setState("transpose", 3);

  assert.deepEqual(order, ["a", "b"]);
});

test("ein Zuhörer sieht beim Aufruf schon den neuen Wert in state", () => {
  let seen = null;
  onStateChange(key => { if (key === "sustain") seen = state.sustain; });

  setState("sustain", true);

  assert.equal(seen, true);
});

test("onStateChange mit Namensliste ruft nur bei diesen Werten, in Reihenfolge der Anmeldung", () => {
  const calls = [];
  onStateChange(["rootMidi", "a4Frequency"], (...args) => calls.push(["a", ...args]));
  onStateChange(["rootMidi"], (...args) => calls.push(["b", ...args]));
  const previousRoot = state.rootMidi;
  const previousPitch = state.a4Frequency;
  setState("instrument", state.instrument === "piano" ? "organ" : "piano");
  setState("rootMidi", previousRoot + 1);
  setState("a4Frequency", previousPitch + 1);
  assert.deepEqual(calls, [
    ["a", "rootMidi", previousRoot + 1, previousRoot],
    ["b", "rootMidi", previousRoot + 1, previousRoot],
    ["a", "a4Frequency", previousPitch + 1, previousPitch]
  ]);
});

test("setState und onStateChange werfen bei unbekanntem Namen einen Fehler", () => {
  assert.throws(() => setState("a4Frequenz", 442), /a4Frequenz/);
  assert.throws(() => onStateChange(["rootMidi", "grundton"], () => {}), /grundton/);
  assert.equal(Object.hasOwn(state, "a4Frequenz"), false);
});

test("Werte außerhalb der Grenzen werden auf die Grenze gesetzt, ganze Zahlen gerundet", () => {
  setState("a4Frequency", 1000);
  assert.equal(state.a4Frequency, 880);
  setState("a4Frequency", 0);
  assert.equal(state.a4Frequency, 220);
  setState("a4Frequency", 441.5);
  assert.equal(state.a4Frequency, 441.5);

  setState("transpose", 13);
  assert.equal(state.transpose, 12);
  setState("transpose", -20);
  assert.equal(state.transpose, -12);
  setState("transpose", 2.4);
  assert.equal(state.transpose, 2);

  setState("rootMidi", 200);
  assert.equal(state.rootMidi, 127);
  setState("rootMidi", -1);
  assert.equal(state.rootMidi, 0);
});

test("Tastenanzahl ist durch den untersten Ton begrenzt", () => {
  setStates({ keyboardStartMidi: 100, keyboardKeyCount: 50 });
  assert.equal(state.keyboardStartMidi, 100);
  assert.equal(state.keyboardKeyCount, 28);
  setStates({ keyboardStartMidi: 200, keyboardKeyCount: 0 });
  assert.equal(state.keyboardStartMidi, 127);
  assert.equal(state.keyboardKeyCount, 1);
});

test("setStates benachrichtigt erst, wenn alle Werte gesetzt sind, je Wert einmal", () => {
  setStates({ keyboardStartMidi: 45, keyboardKeyCount: 26 });
  const calls = [];
  onStateChange(["keyboardStartMidi", "keyboardKeyCount"], (key, value, previous) => {
    calls.push([key, value, previous, state.keyboardStartMidi, state.keyboardKeyCount]);
  });

  setStates({ keyboardKeyCount: 30, keyboardStartMidi: 50 });

  assert.deepEqual(calls, [
    ["keyboardStartMidi", 50, 45, 50, 30],
    ["keyboardKeyCount", 30, 26, 50, 30]
  ]);
});

test("setStates ohne echte Änderung benachrichtigt nicht, auch nicht an der Grenze", () => {
  setState("transpose", 12);
  const calls = [];
  onStateChange((...args) => calls.push(args));
  setStates({ keyboardStartMidi: state.keyboardStartMidi, transpose: state.transpose });
  setState("transpose", 13);
  assert.deepEqual(calls, []);
});

test("setStates wirft bei unbekanntem Namen und ändert dann nichts", () => {
  const before = { ...state };
  assert.throws(() => setStates({ transpose: 1, grundton: 3 }), /grundton/);
  assert.deepEqual(state, before);
});

test("Werte mit Grenzen nehmen nur Zahlen an; sonst bleibt der bisherige Wert (S12)", () => {
  setState("a4Frequency", 440);
  setState("rootMidi", 60);
  const transposeBefore = state.transpose;
  const seen = [];
  onStateChange((key, value) => seen.push([key, value]));

  setState("a4Frequency", NaN);
  setState("rootMidi", "abc");
  setStates({ transpose: undefined, rootMidi: NaN });

  assert.equal(state.a4Frequency, 440);
  assert.equal(state.rootMidi, 60);
  assert.equal(state.transpose, transposeBefore);
  assert.deepEqual(seen, []);
});

test("state.js läuft auch ohne Object.hasOwn (ältere iOS-Versionen, S14.1)", async () => {
  const original = Object.hasOwn;
  delete Object.hasOwn;
  try {
    const old = await import("../js/state.js?ohne-hasOwn");
    old.setState("transpose", 3);
    assert.equal(old.state.transpose, 3);
    assert.throws(() => old.setState("gibtEsNicht", 1), /Unbekannter Wert/);
  } finally {
    Object.hasOwn = original;
  }
});
