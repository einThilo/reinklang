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

const { Keyboard } = await import("../js/keyboard.js");

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

test("Grundton-Markierung wechselt und bleibt beim Neuaufbau erhalten", () => {
  const keyboard = createKeyboard({ startMidi: 60, keyCount: 12 });
  keyboard.highlightHarmonyKey(64);
  keyboard.highlightHarmonyKey(67);
  assert.equal(has(keyboard, 64, "active"), false);
  assert.equal(has(keyboard, 67, "active"), true);

  keyboard.setRange({ startMidi: 60, keyCount: 12 });

  assert.equal(has(keyboard, 67, "active"), true);
  assert.equal(has(keyboard, 64, "active"), false);
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
