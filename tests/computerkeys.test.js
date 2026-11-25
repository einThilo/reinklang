import { test } from "node:test";
import assert from "node:assert/strict";
import { computerKeyMap, WHITE_CODES, BLACK_CODES } from "../js/computerkeys.js";

// Tasten wie in Keyboard.keys: aufsteigend, mit Farbe (ohne Transposition: c, d, e, f, g, a, h weiß).
function keys(start, count, transpose = 0) {
  const white = [0, 2, 4, 5, 7, 9, 11];
  return Array.from({ length: count }, (_, i) => {
    const midi = start + i;
    return { midi, isWhite: white.includes((((midi - transpose) % 12) + 12) % 12) };
  });
}

test("Z10: zwölf weiße und zwölf schwarze Codes, nach physischer Lage", () => {
  assert.equal(WHITE_CODES.length, 12);
  assert.equal(BLACK_CODES.length, 12);
  assert.equal(WHITE_CODES[0], "KeyA");
  assert.equal(WHITE_CODES[11], "Backslash");   // „#“ auf der deutschen Tastatur
  assert.equal(BLACK_CODES[5], "KeyY");         // „z“ auf der deutschen Tastatur
});

test("Z10: Vorgabe A2 bis A#4 – „a“ ist die unterste ganz sichtbare weiße Taste (H2), Lücken bleiben stumm", () => {
  const map = computerKeyMap(keys(45, 26), true);
  // A2 (45) ragt zur Hälfte über den Rand; ganz sichtbar beginnt es mit H2 (47).
  assert.equal(map.get("KeyA"), 47);   // H2
  assert.equal(map.get("KeyS"), 48);   // C3
  assert.equal(map.get("KeyD"), 50);   // D3
  assert.equal(map.get("KeyQ"), 46);   // A#2, schwarz links von „a“
  assert.equal(map.has("KeyW"), false); // Lücke h–c
  assert.equal(map.get("KeyE"), 49);   // C#3
  assert.equal(map.get("KeyR"), 51);   // D#3
  assert.equal(map.has("KeyT"), false); // Lücke e–f
  assert.equal(map.get("Backslash"), 65); // zwölfte weiße: F4
  assert.equal(map.get("BracketLeft"), 63); // D#4, zwischen „ö“ (D4) und „ä“ (E4)
  assert.equal(map.has("BracketRight"), false); // Lücke e–f
});

test("Z10: was über den sichtbaren Bereich hinausgeht, bleibt stumm", () => {
  const map = computerKeyMap(keys(60, 6), true);   // C4 (halb) bis F4 (halb)
  assert.equal(map.get("KeyA"), 62);   // D4
  assert.equal(map.get("KeyS"), 64);   // E4
  assert.equal(map.get("KeyD"), 65);   // F4, die halbe oberste Taste ist sichtbar
  assert.equal(map.has("KeyF"), false);
  assert.equal(map.get("KeyQ"), 61);   // C#4
  assert.equal(map.get("KeyW"), 63);   // D#4
  assert.equal(map.has("KeyE"), false);
});

test("Z10: ohne abgeschnittene Randtasten beginnt „a“ bei der untersten weißen", () => {
  const map = computerKeyMap(keys(60, 12), false);
  assert.equal(map.get("KeyA"), 60);
  assert.equal(map.has("KeyQ"), false);
});

test("Z10: mit Transposition folgt die Belegung den Farben der Klaviatur", () => {
  const map = computerKeyMap(keys(60, 12, 2), false); // 60 klingt, ist aber als ais gefärbt
  assert.equal(map.get("KeyA"), 61);   // als h gefärbt
  assert.equal(map.has("KeyW"), false); // Lücke h–c
  assert.equal(map.get("KeyE"), 63);   // als cis gefärbt
});
