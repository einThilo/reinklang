import { test } from "node:test";
import assert from "node:assert/strict";

import { readOptions } from "../js/options.js";

// Eigene Schalter-Tabelle zum Testen, unabhängig davon, welche Schalter gerade gelten.
const PROBE = { probe: ["1", "a"] };

test("ohne Zusatz in der Adresse sind alle Schalter null", () => {
  const options = readOptions("", PROBE);
  assert.deepEqual(Object.keys(options), Object.keys(PROBE));
  assert.equal(options.probe, null);
});

test("bekannter Name mit bekanntem Wert wird übernommen", () => {
  assert.equal(readOptions("?probe=1", PROBE).probe, "1");
  assert.equal(readOptions("?layout=band&probe=a", PROBE).probe, "a");
});

test("unbekannter Wert oder unbekannter Name gilt als Vorgabe", () => {
  assert.equal(readOptions("?probe=2", PROBE).probe, null);
  assert.equal(readOptions("?probe", PROBE).probe, null);
  assert.equal(Object.hasOwn(readOptions("?unbekannt=1", PROBE), "unbekannt"), false);
});

test("ohne Tabelle gelten die Schalter aus options.js", () => {
  assert.deepEqual(readOptions("?wach=1"), { quer: null });
  assert.equal(readOptions("?quer=drehen").quer, "drehen");
});
