import { test } from "node:test";
import assert from "node:assert/strict";

import { INTERVALS, EDOS, buildIntervals, formatInterval, nearestIntervalIndex } from "../js/intervals.js";
import { TUNINGS } from "../js/tuning.js";

test("die Liste ist nach Cent aufsteigend sortiert und reicht von 1/1 bis 2/1", () => {
  for (let i = 1; i < INTERVALS.length; i++) assert.ok(INTERVALS[i - 1].cents < INTERVALS[i].cents);
  assert.equal(INTERVALS[0].value, "1/1");
  assert.equal(INTERVALS.at(-1).value, "2/1");
});

test("alle EDO-Stufen sind enthalten", () => {
  assert.deepEqual(EDOS, [12, 19, 22, 24, 31, 53]);
  for (const n of EDOS) {
    for (let step = 1; step < n; step++) {
      const name = `${step}. Stufe ${n}-EDO`;
      assert.ok(INTERVALS.some((entry) => entry.names.includes(name)), name);
    }
  }
});

test("alle Werte der fest hinterlegten Stimmungen stehen in der Liste", () => {
  for (const tuning of Object.values(TUNINGS)) {
    if (tuning.ratios[12] !== 2) continue;
    tuning.values.forEach((value, i) => {
      const entry = INTERVALS[nearestIntervalIndex(INTERVALS, value)];
      assert.ok(Math.abs(entry.cents - 1200 * Math.log2(tuning.ratios[i + 1])) < 0.005, `${tuning.name}: ${value}`);
    });
  }
});

test("gleiche Tonhöhen werden ein Eintrag mit mehreren Namen, ein Verhältnis geht vor", () => {
  const list = buildIntervals(["50.00 | Equal-tempered quarter tone", "2/1 | Octave", "600.00 | Tritone"], [2, 24]);
  const quarter = list.find((entry) => entry.value === "50.00");
  assert.deepEqual(quarter.names, ["Equal-tempered quarter tone", "1. Stufe 24-EDO"]);
  const tritone = list.find((entry) => entry.value === "600.00");
  assert.deepEqual(tritone.names, ["Tritone", "1. Stufe 2-EDO", "12. Stufe 24-EDO"]);
  assert.equal(list.length, 24);

  const ratioLater = buildIntervals(["1200.00 | Cent-Oktave", "2/1 | Octave"], []);
  assert.equal(ratioLater.length, 1);
  assert.equal(ratioLater[0].value, "2/1");
  assert.deepEqual(ratioLater[0].names, ["Cent-Oktave", "Octave"]);
});

test("in der echten Liste sind 12-EDO-Stufen mit den Wikipedia-Einträgen zusammengelegt", () => {
  const fifth = INTERVALS.find((entry) => entry.names.includes("7. Stufe 12-EDO"));
  assert.equal(fifth.value, "700.00");
  assert.ok(fifth.names.includes("Equal-tempered perfect fifth"));
  assert.ok(fifth.names.includes("14. Stufe 24-EDO"));
});

test("Text eines Eintrags: Wert, Namen, Cent und Abweichung zur nächsten 12-EDO-Stufe", () => {
  assert.equal(formatInterval({ value: "5/4", cents: 386.3137, names: ["major third"] }),
    "5/4 · major third · 386.31 ct (−14)");
  assert.equal(formatInterval({ value: "700.00", cents: 700, names: ["fifth", "7. Stufe 12-EDO"] }),
    "700.00 · fifth / 7. Stufe 12-EDO · 700.00 ct (0)");
  assert.equal(formatInterval({ value: "7/4", cents: 968.826, names: ["harmonic seventh"] }),
    "7/4 · harmonic seventh · 968.83 ct (−31)");
});

test("nächstliegender Eintrag zu einem Wert", () => {
  const list = buildIntervals(["1/1 | Unison", "5/4 | major third", "4/3 | fourth", "2/1 | Octave"], []);
  assert.equal(nearestIntervalIndex(list, "5/4"), 1);
  assert.equal(nearestIntervalIndex(list, "10/8"), 1);
  assert.equal(nearestIntervalIndex(list, "400.0"), 1);
  assert.equal(nearestIntervalIndex(list, "480.0"), 2);
  assert.equal(nearestIntervalIndex(list, "x"), -1);
});
