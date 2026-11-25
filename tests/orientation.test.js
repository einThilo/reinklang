import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRotate, keepLandscape, lockLandscape } from "../js/orientation.js";

test("L10: gedreht wird nur, wenn das Fenster deutlich höher als breit ist", () => {
  assert.equal(shouldRotate(400, 860), true);
  assert.equal(shouldRotate(860, 400), false);
  assert.equal(shouldRotate(800, 820), false);   // fast quadratisch: Spielraum
  assert.equal(shouldRotate(800, 800), false);
});

test("L10: keepLandscape setzt Klasse und Maße und folgt Größenänderungen", () => {
  const classes = new Set();
  const props = {};
  let onResize;
  const win = { innerWidth: 400, innerHeight: 860, addEventListener: (type, fn) => { onResize = fn; } };
  const doc = { body: {
    style: { setProperty: (name, value) => { props[name] = value; } },
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) }
  } };
  keepLandscape(win, doc);
  assert.equal(classes.has("rotated"), true);
  assert.equal(props["--win-w"], "400px");
  win.innerWidth = 860; win.innerHeight = 400;
  onResize();
  assert.equal(classes.has("rotated"), false);
  assert.equal(props["--win-h"], "400px");
});

test("L10: lockLandscape schluckt Fehler und fehlende Unterstützung", async () => {
  assert.equal(await lockLandscape({ orientation: { lock: async () => { throw new Error("nicht im Vollbild"); } } }), false);
  assert.equal(await lockLandscape({}), false);
  assert.equal(await lockLandscape({ orientation: { lock: async () => {} } }), true);
});
