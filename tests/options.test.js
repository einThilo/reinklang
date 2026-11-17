import { test } from "node:test";
import assert from "node:assert/strict";

import { readOptions, SWITCHES } from "../js/options.js";

test("ohne Zusatz in der Adresse sind alle Schalter null", () => {
  const options = readOptions("");
  assert.deepEqual(Object.keys(options), Object.keys(SWITCHES));
  for (const name of Object.keys(SWITCHES)) assert.equal(options[name], null);
});

test("bekannter Name mit bekanntem Wert wird übernommen", () => {
  assert.equal(readOptions("?sperren=aus").sperren, "aus");
  assert.equal(readOptions("?layout=band&sperren=aus").sperren, "aus");
});

test("unbekannter Wert oder unbekannter Name gilt als Vorgabe", () => {
  assert.equal(readOptions("?sperren=an").sperren, null);
  assert.equal(readOptions("?sperren").sperren, null);
  assert.equal(Object.hasOwn(readOptions("?unbekannt=1"), "unbekannt"), false);
});

test("jeder Schalter nimmt jeden seiner Werte an", () => {
  for (const [name, values] of Object.entries(SWITCHES)) {
    for (const value of values) assert.equal(readOptions(`?${name}=${value}`)[name], value);
  }
});
