import { test } from "node:test";
import assert from "node:assert/strict";

// Kleinste Attrappe für `document`, gerade genug für das Anlegen und Markieren der Häuser.
function createElement() {
  const classes = new Set();
  return {
    dataset: {},
    style: {},
    classList: {
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      add: name => classes.add(name),
      contains: name => classes.has(name)
    },
    set className(value) {
      classes.clear();
      value.split(" ").filter(Boolean).forEach(name => classes.add(name));
    },
    appendChild: () => {},
    addEventListener: () => {}
  };
}
globalThis.document = { createElement };

const { HarmonyKeyboard, houseLayout } = await import("../js/harmony.js");

test("15 Häuser: unten die 7 weißen, oben 5 schwarze und 3 Sonderhäuser, alle gleich breit", () => {
  const houses = houseLayout();
  const lower = houses.filter(house => house.row === "lower");
  const upper = houses.filter(house => house.row === "upper");

  assert.deepEqual(lower.map(house => house.offset), [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(upper.map(house => house.offset ?? house.special),
    ["left", 1, 3, "middle", 6, 8, 10, "right"]);
  houses.forEach(house => assert.equal(house.width, 100 / 7));
});

test("Obere Häuser sitzen mittig auf den Grenzen, die äußeren ragen zur Hälfte hinaus", () => {
  const upper = houseLayout().filter(house => house.row === "upper");
  const width = 100 / 7;
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
  near(upper[0].left, -width / 2);
  near(upper[3].left + width / 2, 3 * width); // zwischen e und f
  near(upper[7].left + width, 100 + width / 2);
});

test("Tonhäuser tragen ihren Ton ab dem untersten, auch nach setStart", () => {
  const keyboard = new HarmonyKeyboard({ container: createElement(), startMidi: 60 });
  assert.deepEqual([...keyboard.keyElements.keys()].sort((a, b) => a - b),
    [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]);

  keyboard.setStart(62);
  assert.equal(keyboard.keyElements.get(62).classList.contains("white"), true); // klingt D, liegt wie C
  assert.equal(keyboard.keyElements.get(63).classList.contains("black"), true);
  assert.equal(keyboard.keyElements.has(60), false);
});

test("Sonderhäuser haben keinen Ton", () => {
  const keyboard = new HarmonyKeyboard({ container: createElement(), startMidi: 60 });
  const specials = keyboard.elements.filter(element => element.classList.contains("special"));
  assert.deepEqual(specials.map(element => element.dataset.special), ["left", "middle", "right"]);
  specials.forEach(element => assert.equal(element.dataset.midi, undefined));
  assert.equal(keyboard.specialElements.get("middle"), specials[1]);
});

test("Grundton-Markierung wechselt und bleibt nach setStart am selben Ton", () => {
  const keyboard = new HarmonyKeyboard({ container: createElement(), startMidi: 60 });
  keyboard.highlight(64);
  keyboard.highlight(67);
  assert.equal(keyboard.keyElements.get(64).classList.contains("active"), false);
  assert.equal(keyboard.keyElements.get(67).classList.contains("active"), true);

  keyboard.setStart(61);
  assert.equal(keyboard.keyElements.get(67).classList.contains("active"), true);
});

test("Markierung blass oder gar keine", () => {
  const keyboard = new HarmonyKeyboard({ container: createElement(), startMidi: 60 });
  const classes = midi => ["active", "pale"].filter(name => keyboard.keyElements.get(midi).classList.contains(name));
  keyboard.highlight(64, true);
  assert.deepEqual(classes(64), ["active", "pale"]);
  keyboard.highlight(64);
  assert.deepEqual(classes(64), ["active"]);
  keyboard.highlight(null);
  assert.deepEqual(classes(64), []);
});
