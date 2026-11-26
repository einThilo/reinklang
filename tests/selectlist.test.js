import { test } from "node:test";
import assert from "node:assert/strict";

import { optionText, markSelected } from "../js/selectlist.js";

test("nur der gewählte Eintrag bekommt den Punkt", () => {
  assert.equal(optionText("Thilo", true), "● Thilo");
  assert.equal(optionText("Thilo", false), "Thilo");
});

test("markSelected setzt den Punkt um, wenn sich die Wahl ändert", () => {
  const names = { a: "Erste", b: "Zweite" };
  const select = { options: [{ value: "a", textContent: "" }, { value: "b", textContent: "" }] };
  markSelected(select, "a", names);
  assert.deepEqual(select.options.map((o) => o.textContent), ["● Erste", "Zweite"]);
  markSelected(select, "b", names);
  assert.deepEqual(select.options.map((o) => o.textContent), ["Erste", "● Zweite"]);
});
