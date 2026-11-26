import { test } from "node:test";
import assert from "node:assert/strict";

import { tuningListEntries, degreeOf, ADJUST_ENTRY } from "../js/tuningeditor.js";
import { TUNINGS, adjustedCopy, customTuningKey } from "../js/tuning.js";

test("Stimmungsliste: eigene oben, dann fest hinterlegte, zuletzt „Stimmung anpassen“", () => {
  const own = adjustedCopy(TUNINGS.thilo);
  const entries = tuningListEntries({ [customTuningKey(own.name)]: own });
  assert.deepEqual(entries[0], { value: "own:Thilo (angepasst)", name: "Thilo (angepasst)" });
  assert.deepEqual(entries.slice(1, -1).map((e) => e.value), Object.keys(TUNINGS));
  assert.equal(entries.at(-1).value, ADJUST_ENTRY);
  assert.equal(tuningListEntries({}).length, Object.keys(TUNINGS).length + 1);
});

test("„Stimmung anpassen“ hat keinen Schlüssel einer Stimmung", () => {
  assert.equal(Object.hasOwn(TUNINGS, ADJUST_ENTRY), false);
  assert.equal(ADJUST_ENTRY.startsWith("own:"), false);
});

test("degreeOf: Grad zum Grundton, auch unterhalb und über mehrere Oktaven", () => {
  assert.equal(degreeOf(60, 60), 0);
  assert.equal(degreeOf(64, 60), 4);
  assert.equal(degreeOf(59, 60), 11);
  assert.equal(degreeOf(62, 67), 7);
  assert.equal(degreeOf(84, 60), 0);
});
