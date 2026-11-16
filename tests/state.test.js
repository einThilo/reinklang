import { test } from "node:test";
import assert from "node:assert/strict";
import { state, setState, onStateChange } from "../js/state.js";

// Die Tests teilen sich das eine `state`-Objekt und laufen der Reihe nach.

test("Startwerte", () => {
  assert.deepEqual(state, {
    rootMidi: 60,
    harmonyMode: "first",
    tuningMode: "thilo",
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
