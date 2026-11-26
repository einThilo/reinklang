import { test } from "node:test";
import assert from "node:assert/strict";
import { TUNINGS, parseTuningLine, formatTuningLine, parseTuningText, midiToFrequency, frequencyFromState, centsFromEqual, deviationPosition, formatCents } from "../js/tuning.js";

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9 * expected, `${actual} statt ${expected}`);
}

const equal = { tuningMode: "equal", a4Frequency: 440, tuningRootMidi: 60 };
const thilo = { tuningMode: "thilo", a4Frequency: 440, tuningRootMidi: 60 };
const c4 = 440 * Math.pow(2, -9 / 12);

test("gleichstufig: A4 ist der Stimmton", () => {
  assertClose(midiToFrequency(69, equal), 440);
  assertClose(midiToFrequency(69, { ...equal, a4Frequency: 432 }), 432);
});

test("gleichstufig: Oktave ist Faktor 2, Halbton die zwölfte Wurzel aus 2", () => {
  assertClose(midiToFrequency(81, equal), 880);
  assertClose(midiToFrequency(57, equal), 220);
  assertClose(midiToFrequency(70, equal), 440 * Math.pow(2, 1 / 12));
});

test("unbekannte Stimmung rechnet gleichstufig", () => {
  assertClose(midiToFrequency(64, { ...equal, tuningMode: "gibtEsNicht" }), midiToFrequency(64, equal));
});

test("Grundton hat seine gleichstufige Frequenz", () => {
  assertClose(midiToFrequency(60, thilo), c4);
  assertClose(midiToFrequency(62, { ...thilo, tuningRootMidi: 62 }), midiToFrequency(62, equal));
});

test("Intervalle über dem Grundton folgen der Tabelle", () => {
  TUNINGS.thilo.ratios.forEach((ratio, degree) => {
    assertClose(midiToFrequency(60 + degree, thilo), c4 * ratio);
  });
});

test("Intervalle über mehrere Oktaven und unterhalb des Grundtons", () => {
  assertClose(midiToFrequency(72, thilo), c4 * 2);
  assertClose(midiToFrequency(79, thilo), c4 * 3);
  assertClose(midiToFrequency(48, thilo), c4 / 2);
  assertClose(midiToFrequency(55, thilo), c4 * (3 / 2) / 2);
  assertClose(midiToFrequency(59, thilo), c4 * (15 / 8) / 2);
});

test("Wechsel des Grundtons verschiebt die Intervalle", () => {
  const settings = { ...thilo, tuningRootMidi: 65 };
  const f4 = midiToFrequency(65, equal);
  assertClose(midiToFrequency(69, settings), f4 * 5 / 4);
  assertClose(midiToFrequency(60, settings), f4 * (3 / 2) / 2);
});

test("jede fest hinterlegte Stimmung hat einen Namen, 12 Werte und die Oktave 2", () => {
  for (const [key, tuning] of Object.entries(TUNINGS)) {
    if (key === "testStretched") continue;
    assert.equal(typeof tuning.name, "string", key);
    assert.equal(tuning.values.length, 12, key);
    assert.equal(tuning.ratios.length, 13, key);
    assert.equal(tuning.ratios[0], 1, key);
    assertClose(tuning.ratios[12], 2);
  }
});

test("fest hinterlegte Stimmungen klingen wie vor Z3.1", () => {
  const before = {
    just7Tri: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8],
    justHarmonicCarlos: [1, 17 / 16, 9 / 8, 19 / 16, 5 / 4, 21 / 16, 11 / 8, 3 / 2, 13 / 8, 27 / 16, 7 / 4, 15 / 8],
    justSuperCarlos: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 11 / 8, 3 / 2, 13 / 8, 5 / 3, 7 / 4, 15 / 8],
    thilo: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 7 / 4, 15 / 8],
    liligetia: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 11 / 8, 7 / 5, 12 / 8, 8 / 5, 13 / 8, 7 / 4, 15 / 8]
  };
  assert.deepEqual(Object.keys(TUNINGS), ["equal", ...Object.keys(before), "testStretched"]);
  for (const [key, ratios] of Object.entries(before)) {
    for (let midi = 40; midi < 90; midi++) {
      const settings = { tuningMode: key, a4Frequency: 440, tuningRootMidi: 62 };
      const diff = midi - 62;
      const expected = midiToFrequency(62, equal) * ratios[((diff % 12) + 12) % 12] * Math.pow(2, Math.floor(diff / 12));
      assertClose(midiToFrequency(midi, settings), expected);
    }
  }
  for (let midi = 40; midi < 90; midi++) {
    assertClose(midiToFrequency(midi, { ...equal, tuningRootMidi: 63 }), 440 * Math.pow(2, (midi - 69) / 12));
  }
});

test("parseTuningLine: Verhältnisse und Cent-Werte", () => {
  const tuning = parseTuningLine("  Probe (2) | 17/16 9/8  6/5 5/4 4/3 7/5 3/2 8/5 5/3 7/4 1088.27 2 ");
  assert.equal(tuning.name, "Probe (2)");
  assert.deepEqual(tuning.values, ["17/16", "9/8", "6/5", "5/4", "4/3", "7/5", "3/2", "8/5", "5/3", "7/4", "1088.27", "2"]);
  assertClose(tuning.ratios[1], 17 / 16);
  assertClose(tuning.ratios[11], Math.pow(2, 1088.27 / 1200));
  assert.equal(tuning.ratios[12], 2);
  assertClose(parseTuningLine("Ä | 100. 200.0 300.0 400.0 500.0 600.0 700.0 800.0 900.0 1000.0 -1.5 1200.0").ratios[11],
    Math.pow(2, -1.5 / 1200));
});

test("formatTuningLine: geschrieben und wieder gelesen ergibt dieselbe Stimmung", () => {
  for (const tuning of Object.values(TUNINGS)) {
    assert.deepEqual(parseTuningLine(formatTuningLine(tuning)), tuning);
  }
  assert.equal(formatTuningLine(TUNINGS.thilo), "Thilo | 17/16 9/8 6/5 5/4 4/3 7/5 3/2 8/5 5/3 7/4 15/8 2/1");
});

test("parseTuningLine: nicht lesbare Zeilen geben eine Meldung", () => {
  const values = "17/16 9/8 6/5 5/4 4/3 7/5 3/2 8/5 5/3 7/4 15/8";
  const bad = [
    `Ohne Trenner ${values} 2/1`,
    `A | B | ${values} 2/1`,
    ` | ${values} 2/1`,
    `<b>x</b> | ${values} 2/1`,
    `${"x".repeat(41)} | ${values} 2/1`,
    `Zu wenig | ${values}`,
    `Zu viel | ${values} 2/1 3/1`,
    `Buchstabe | ${values} zwei`,
    `Null | ${values.replace("9/8", "0/8")} 2/1`,
    `Durch null | ${values.replace("9/8", "9/0")} 2/1`,
    `Oktave | ${values} 1/1`,
    `Oktave Cent | ${values} -5.0`
  ];
  for (const line of bad) {
    const result = parseTuningLine(line);
    assert.equal(typeof result.error, "string", line);
    assert.equal(result.name, undefined, line);
  }
});

test("parseTuningText: eine Stimmung je Zeile, leere Zeilen zählen nicht", () => {
  const text = `${formatTuningLine(TUNINGS.thilo)}\n\n  \r\nKaputt | 1/1\n${formatTuningLine(TUNINGS.equal)}\n`;
  const results = parseTuningText(text);
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], TUNINGS.thilo);
  assert.equal(typeof results[1].error, "string");
  assert.deepEqual(results[2], TUNINGS.equal);
});

test("frequencyFromState: ohne Use tuning gleichstufig, mit Use tuning die gewählte Stimmung zum Grundton", () => {
  const settings = { a4Frequency: 440, tuningMode: "thilo", useTuning: false, rootMidi: 60 };
  assertClose(frequencyFromState(64, settings), midiToFrequency(64, equal));
  assertClose(frequencyFromState(64, { ...settings, useTuning: true }), c4 * 5 / 4);
  assertClose(frequencyFromState(69, { ...settings, useTuning: true, rootMidi: 62 }),
    midiToFrequency(62, equal) * 3 / 2);
  assertClose(frequencyFromState(69, { ...settings, a4Frequency: 432 }), 432);
});

test("centsFromEqual: ohne Use tuning 0, mit Use tuning die Abweichung der Stimmung zum Grundton", () => {
  const settings = { a4Frequency: 440, tuningMode: "thilo", useTuning: false, rootMidi: 60 };
  assert.equal(centsFromEqual(64, settings), 0);

  const tuned = { ...settings, useTuning: true };
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} statt ${expected}`);
  close(centsFromEqual(60, tuned), 0);
  close(centsFromEqual(64, tuned), -13.69);  // große Terz 5/4
  close(centsFromEqual(67, tuned), 1.96);    // Quinte 3/2
  close(centsFromEqual(70, tuned), -31.17);  // Septime 7/4
  close(centsFromEqual(76, tuned), -13.69);  // eine Oktave höher gleich
  close(centsFromEqual(64, { ...tuned, rootMidi: 62 }), 3.91);  // große Sekunde 9/8 über D
});

test("deviationPosition: Mitte bei 0 Cent, Ränder bei ±50 Cent, darüber hinaus abgeschnitten", () => {
  assert.equal(deviationPosition(0), 50);
  assert.equal(deviationPosition(-50), 0);
  assert.equal(deviationPosition(25), 75);
  assert.equal(deviationPosition(51.3), 100);
  assert.equal(deviationPosition(-80), 0);
});

test("formatCents: ganze Cent mit Vorzeichen", () => {
  assert.equal(formatCents(1.96), "+2");
  assert.equal(formatCents(-13.69), "−14");
  assert.equal(formatCents(0.3), "0");
  assert.equal(formatCents(-0.3), "0");
});

// Z3.7: Oktavverhältnis aus der Stimmung. „Test gestreckt“ = Werte von Thilo mit Oktave 3/1.
const stretched = { a4Frequency: 440, tuningMode: "testStretched", useTuning: true, rootMidi: 62 };
const stretchedEqual = (midi) => 440 * Math.pow(3, (midi - 69) / 12);

test("Test gestreckt: Werte von Thilo, Oktave 3/1", () => {
  assert.equal(TUNINGS.testStretched.name, "Test gestreckt");
  assert.deepEqual(TUNINGS.testStretched.values, [...TUNINGS.thilo.values.slice(0, 11), "3/1"]);
});

test("Oktave ≠ 2: A4 bleibt beim Stimmton, Grundton liegt gleichstufig mit der Oktave der Stimmung", () => {
  assertClose(frequencyFromState(62, stretched), stretchedEqual(62));
  assertClose(frequencyFromState(69, { ...stretched, rootMidi: 69 }), 440);
  assertClose(frequencyFromState(69, { ...stretched, rootMidi: 69, a4Frequency: 432 }), 432);
});

test("Oktave ≠ 2: Ton = Grundton · Wert · Oktave^k", () => {
  const root = stretchedEqual(62);
  assertClose(frequencyFromState(66, stretched), root * 5 / 4);
  assertClose(frequencyFromState(74, stretched), root * 3);
  assertClose(frequencyFromState(78, stretched), root * 5 / 4 * 3);
  assertClose(frequencyFromState(61, stretched), root * 15 / 8 / 3);
  assertClose(frequencyFromState(50, stretched), root / 3);
});

test("Oktave ≠ 2: Abweichung gegenüber gleichstufig mit derselben Oktave", () => {
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} statt ${expected}`);
  close(centsFromEqual(62, stretched), 0);
  close(centsFromEqual(74, stretched), 0);
  close(centsFromEqual(66, stretched), 1200 * Math.log2(5 / 4) - 1200 * Math.log2(3) * 4 / 12);
});

test("Tuning aus: gleichstufig mit Oktave 2, auch wenn die Stimmung eine andere Oktave hat", () => {
  const off = { ...stretched, useTuning: false };
  for (let midi = 40; midi < 90; midi++) {
    assertClose(frequencyFromState(midi, off), 440 * Math.pow(2, (midi - 69) / 12));
    assert.equal(centsFromEqual(midi, off), 0);
  }
});
