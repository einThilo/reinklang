import { test } from "node:test";
import assert from "node:assert/strict";

// Kleinste Attrappe für `document`, gerade genug für das Anlegen und Markieren der Tasten.
function createElement() {
  const classes = new Set();
  const element = {
    children: [],
    dataset: {},
    style: {},
    textContent: "",
    classList: {
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name)
    },
    set className(value) {
      classes.clear();
      value.split(" ").filter(Boolean).forEach(name => classes.add(name));
    },
    set innerHTML(value) { element.children = []; },
    appendChild: child => element.children.push(child),
    addEventListener: () => {}
  };
  return element;
}
globalThis.document = { createElement };

const { Keyboard, keyPositions } = await import("../js/keyboard.js");

function createKeyboard(options) {
  return new Keyboard({ container: createElement(), ...options });
}

const has = (keyboard, midi, name) => keyboard.keyElements.get(midi).classList.contains(name);

test("Markierungen bleiben beim Neuaufbau des Tastenbereichs erhalten", () => {
  const keyboard = createKeyboard({ startMidi: 60, keyCount: 12 });
  keyboard.setHeldState(62, true);
  keyboard.setActiveState(64, true);

  keyboard.setRange({ startMidi: 55, keyCount: 20 });

  assert.equal(has(keyboard, 62, "held"), true);
  assert.equal(has(keyboard, 64, "active"), true);
  assert.equal(has(keyboard, 60, "held"), false);
  assert.equal(has(keyboard, 60, "active"), false);
});

test("Markierung außerhalb des Bereichs taucht wieder auf, wenn die Taste zurückkommt", () => {
  const keyboard = createKeyboard({ startMidi: 60, keyCount: 12 });
  keyboard.setHeldState(80, true);
  assert.equal(keyboard.keyElements.has(80), false);

  keyboard.setRange({ startMidi: 70, keyCount: 12 });

  assert.equal(has(keyboard, 80, "held"), true);
});

test("Aufheben einer Markierung wirkt auch nach dem Neuaufbau", () => {
  const keyboard = createKeyboard({ startMidi: 60, keyCount: 12 });
  keyboard.setHeldState(62, true);
  keyboard.setHeldState(62, false);
  keyboard.setRange({ startMidi: 60, keyCount: 13 });
  assert.equal(has(keyboard, 62, "held"), false);
});

test("Transposition kommt über Konstruktor und setRange und verschiebt die Farben", () => {
  const keyboard = createKeyboard({ startMidi: 60, keyCount: 12, transposeOffset: 2 });
  assert.equal(has(keyboard, 62, "white"), true); // klingt D, sieht aus wie C
  assert.equal(has(keyboard, 63, "black"), true); // klingt D#, sieht aus wie C#

  keyboard.setHeldState(62, true);
  keyboard.setRange({ transposeOffset: 1 });

  assert.equal(keyboard.transposeOffset, 1);
  assert.equal(keyboard.startMidi, 60);
  assert.equal(keyboard.keyCount, 12);
  assert.equal(has(keyboard, 61, "white"), true);
  assert.equal(has(keyboard, 62, "black"), true);
  assert.equal(has(keyboard, 62, "held"), true);

  keyboard.setRange({ startMidi: 50 });
  assert.equal(keyboard.transposeOffset, 1);
});

// --- keyPositions ---

const W = { isWhite: true };
const B = { isWhite: false };

test("keyPositions (Vorgabe): weiße Tasten teilen die Breite, schwarze sitzen auf der Grenze", () => {
  const positions = keyPositions([W, B, W, W]);
  assert.deepEqual(positions[0], { left: 0, width: (1 / 3) * 100 });
  assert.deepEqual(positions[1], { left: ((1 - 0.45) / 3) * 100, width: (0.9 / 3) * 100 });
  assert.deepEqual(positions[2], { left: (1 / 3) * 100, width: (1 / 3) * 100 });
  assert.deepEqual(positions[3], { left: (2 / 3) * 100, width: (1 / 3) * 100 });
});

test("keyPositions (Vorgabe): schwarze Randtaste ragt zur Hälfte hinaus, ohne weiße Taste keine Lage (S10, S11)", () => {
  const positions = keyPositions([B, W, B]);
  assert.ok(positions[0].left < 0);
  assert.ok(positions[2].left + positions[2].width > 100);
  assert.deepEqual(keyPositions([B]), []);
  assert.deepEqual(keyPositions([]), []);
});

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} statt ${expected}`);

// Mitte einer Taste in Prozent der Klaviaturbreite.
const middle = position => position.left + position.width / 2;

test("keyPositions mit halben Randtasten (S11.2): weiße Randtasten ragen zur Hälfte hinaus", () => {
  const positions = keyPositions([W, B, W, W], true);
  close(middle(positions[0]), 0);
  close(middle(positions[3]), 100);
  // Zwei weiße Breiten sind sichtbar: von der Mitte der ersten bis zur Mitte der letzten Taste.
  close(positions[0].width, 50);
  close(positions[1].width, 0.9 * 50);
  close(positions[2].left, 25);
});

test("keyPositions mit halben Randtasten: schwarze Randtasten ragen wie bisher zur Hälfte hinaus", () => {
  const positions = keyPositions([B, W, B], true);
  close(middle(positions[0]), 0);
  close(middle(positions[2]), 100);
  close(positions[1].left, 0);
  close(positions[1].width, 100);
});

test("keyPositions mit halben Randtasten: Vorgabebereich A2–A#4, Mitte von A2 und A#4 auf dem Rand", () => {
  const keys = Array.from({ length: 26 }, (_, index) => ({ isWhite: [0, 2, 4, 5, 7, 9, 11].includes((45 + index) % 12) }));
  const positions = keyPositions(keys, true);
  assert.equal(positions.length, 26);
  close(middle(positions[0]), 0);
  close(middle(positions[25]), 100);
  // 15 weiße Tasten, davon die erste halb: 14,5 weiße Breiten sind sichtbar.
  close(positions[2].width, 100 / 14.5);
});

test("keyPositions mit halben Randtasten: eine einzelne Taste füllt die Breite, auch eine schwarze (S10)", () => {
  for (const only of [W, B]) {
    const [position] = keyPositions([only], true);
    close(position.left, 0);
    close(position.width, 100);
  }
});

test("Keyboard mit cutEdgeKeys gibt die halben Randtasten weiter", () => {
  const keyboard = createKeyboard({ startMidi: 60, keyCount: 3, cutEdgeKeys: true });
  assert.equal(keyboard.keyElements.get(60).style.left, "-50%");
  assert.equal(keyboard.keyElements.get(60).style.width, "100%");
  assert.equal(keyboard.keyElements.get(62).style.left, "50%");
});

test("Keyboard gibt die Lage als Prozentwerte an die Tasten weiter", () => {
  const keyboard = createKeyboard({ startMidi: 60, keyCount: 3 });
  assert.equal(keyboard.keyElements.get(60).style.left, "0%");
  assert.equal(keyboard.keyElements.get(60).style.width, "50%");
  assert.equal(keyboard.keyElements.get(60).style.height, "100%");
  assert.equal(keyboard.keyElements.get(61).style.left, ((1 - 0.45) / 2) * 100 + "%");
  assert.equal(keyboard.keyElements.get(61).style.height, undefined);
});

const { touchesInside } = await import("../js/keyboard.js");

test("S18: touchesInside erkennt Berührungen, die in der Klaviatur begonnen haben", () => {
  const key = {};
  const button = {};
  const keyboardElement = { contains: node => node === key };
  assert.equal(touchesInside([{ target: key }, { target: button }], keyboardElement), true);
  assert.equal(touchesInside([{ target: button }], keyboardElement), false);
  assert.equal(touchesInside([], keyboardElement), false);
  assert.equal(touchesInside(undefined, keyboardElement), false);
});
