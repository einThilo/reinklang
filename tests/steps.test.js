import { test } from "node:test";
import assert from "node:assert/strict";
import { createStepRun } from "../js/steps.js";

// Attrappe für die Zeitgeber: `runNext()` führt den wartenden Aufruf aus.
function createRun({ limit = Infinity } = {}) {
  let position = 0;
  let pending = null;
  const run = createStepRun({
    step: direction => {
      const next = position + direction;
      if (Math.abs(next) > limit) return false;
      position = next;
      return true;
    },
    intervalMs: 25,
    setTimer: (fn, ms) => { pending = { fn, ms }; return pending; },
    clearTimer: handle => { if (pending === handle) pending = null; }
  });
  const runNext = () => {
    const current = pending;
    pending = null;
    current?.fn();
    return current !== null;
  };
  const runAll = () => { while (runNext()); };
  return { run, runNext, runAll, position: () => position, pending: () => pending };
}

test("der erste Schritt geschieht sofort, die weiteren im Abstand", () => {
  const r = createRun();
  r.run.start(1, 12);
  assert.equal(r.position(), 1);
  assert.equal(r.pending().ms, 25);
  r.runAll();
  assert.equal(r.position(), 12);
  assert.equal(r.pending(), null);
});

test("erneuter Start in gleicher Richtung hängt die Schritte ab dem Ziel an", () => {
  const r = createRun();
  r.run.start(-1, 12);
  r.runNext();
  r.runNext();
  r.run.start(-1, 12);
  r.runAll();
  assert.equal(r.position(), -24);
});

test("Start in Gegenrichtung bricht ab und läuft von der aktuellen Stelle", () => {
  const r = createRun();
  r.run.start(1, 12);
  r.runNext();
  r.runNext();
  r.run.start(-1, 12);
  r.runAll();
  assert.equal(r.position(), 3 - 12);
});

test("stop bricht ab, die Stelle bleibt", () => {
  const r = createRun();
  r.run.start(1, 12);
  r.runNext();
  r.run.stop();
  assert.equal(r.pending(), null);
  assert.equal(r.position(), 2);
});

test("an der Grenze bleibt der Lauf stehen", () => {
  const r = createRun({ limit: 5 });
  r.run.start(1, 12);
  r.runAll();
  assert.equal(r.position(), 5);
  assert.equal(r.pending(), null);
});

test("nach Ende des Laufs beginnt ein neuer Start wieder mit voller Anzahl", () => {
  const r = createRun();
  r.run.start(1, 12);
  r.runAll();
  r.run.start(1, 12);
  r.runAll();
  assert.equal(r.position(), 24);
});
