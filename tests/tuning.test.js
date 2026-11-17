import { test } from "node:test";
import assert from "node:assert/strict";
import { TUNINGS, midiToFrequency, frequencyFromState, centsFromEqual, deviationPosition, formatCents } from "../js/tuning.js";

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

test("jede Stimmung außer der gleichstufigen hat 12 Verhältnisse und beginnt mit 1", () => {
  for (const [key, tuning] of Object.entries(TUNINGS)) {
    assert.equal(typeof tuning.name, "string", key);
    if (key === "equal") {
      assert.equal(tuning.ratios, null);
      continue;
    }
    assert.equal(tuning.ratios.length, 12, key);
    assert.equal(tuning.ratios[0], 1, key);
  }
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
