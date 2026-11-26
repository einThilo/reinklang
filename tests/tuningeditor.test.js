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

import { degreeCents } from "../js/tuningeditor.js";
import { INTERVALS } from "../js/intervals.js";

test("degreeCents: Cent eines Grads", () => {
  assert.ok(Math.abs(degreeCents(TUNINGS.thilo, 7) - 1200 * Math.log2(3 / 2)) < 1e-9);
  assert.ok(Math.abs(degreeCents(TUNINGS.equal, 4) - 400) < 1e-9);
});


import { currentIntervalIndex, intervalDeviation } from "../js/tuningeditor.js";

test("currentIntervalIndex: nur ein Eintrag mit genau dem Wert, Cent-Werte als Zahl", () => {
  assert.equal(INTERVALS[currentIntervalIndex(INTERVALS, "5/4")].value, "5/4");
  assert.equal(currentIntervalIndex(INTERVALS, "386.31"), -1);
  assert.equal(currentIntervalIndex(INTERVALS, "12/8"), -1);
  assert.equal(INTERVALS[currentIntervalIndex(INTERVALS, "150.0")].value, "150.00");
});

test("intervalDeviation: Abweichung vom gleichstufigen Ton des Grads", () => {
  const third = { value: "5/4", cents: 1200 * Math.log2(5 / 4), names: [] };
  const fifth = { value: "3/2", cents: 1200 * Math.log2(3 / 2), names: [] };
  assert.equal(Math.round(intervalDeviation(third, 4, 2)), -14);
  assert.equal(Math.round(intervalDeviation(fifth, 4, 2)), 302);
  assert.ok(Math.abs(intervalDeviation(fifth, 7, 3) - (fifth.cents - 7 * 1200 * Math.log2(3) / 12)) < 1e-9);
});
