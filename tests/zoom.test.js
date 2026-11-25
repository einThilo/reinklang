import { test } from "node:test";
import assert from "node:assert/strict";
import { undoZoom } from "../js/zoom.js";

function fakes(scale) {
  const listeners = {};
  const timers = [];
  let content = "width=device-width, initial-scale=1.0";
  const history = [];
  const meta = {
    getAttribute: () => content,
    setAttribute: (name, value) => { content = value; history.push(value); }
  };
  const viewport = { scale, addEventListener: (type, fn) => { listeners["vv:" + type] = fn; } };
  const win = { visualViewport: viewport, setTimeout: fn => timers.push(fn) };
  const doc = {
    querySelector: () => meta,
    addEventListener: (type, fn) => { listeners["doc:" + type] = fn; }
  };
  return { win, doc, viewport, listeners, timers, history, content: () => content };
}

test("S16: vergrößerte Seite setzt den Viewport neu und danach wieder auf den alten Wert", () => {
  const f = fakes(1);
  undoZoom(f.win, f.doc);
  f.listeners["vv:resize"]();
  assert.deepEqual(f.history, []);          // Maßstab 1: nichts

  f.viewport.scale = 1.6;
  f.listeners["vv:resize"]();
  f.listeners["vv:resize"]();               // läuft schon, kein zweites Mal
  assert.equal(f.history.length, 1);
  f.timers.splice(0).forEach(fn => fn());
  assert.equal(f.content(), "width=device-width, initial-scale=1.0");
});

test("S16: nach dem Verlassen eines Feldes wird geprüft", () => {
  const f = fakes(2);
  undoZoom(f.win, f.doc);
  f.listeners["doc:focusout"]();
  f.timers.splice(0).forEach(fn => fn());
  assert.equal(f.history.length, 1);
});

test("S16: ohne visualViewport geschieht nichts", () => {
  const result = undoZoom({}, { querySelector: () => null });
  assert.equal(result.supported, false);
});
