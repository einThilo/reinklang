import { test } from "node:test";
import assert from "node:assert/strict";

// Attrappe für den AudioContext: Knoten merken sich ihre Aufrufe, die Zeit wird von Hand gestellt.
function param() {
  const calls = [];
  const record = name => (...args) => calls.push([name, ...args]);
  return {
    value: 0,
    calls,
    setValueAtTime: record("setValueAtTime"),
    linearRampToValueAtTime: record("linearRampToValueAtTime"),
    exponentialRampToValueAtTime: record("exponentialRampToValueAtTime"),
    setTargetAtTime: record("setTargetAtTime"),
    cancelScheduledValues: record("cancelScheduledValues")
  };
}

function node(extra = {}) {
  const self = { connectedTo: [], connect: target => self.connectedTo.push(target), disconnect: () => { self.connectedTo = []; }, ...extra };
  return self;
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = "running";
    this.destination = node();
  }
  createGain() { return node({ gain: param() }); }
  createOscillator() {
    const osc = node({ frequency: param(), wave: null, started: null, stopped: null });
    osc.setPeriodicWave = wave => { osc.wave = wave; };
    osc.start = t => { osc.started = t; };
    osc.stop = t => { osc.stopped = t; };
    return osc;
  }
  createDynamicsCompressor() {
    return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  }
  createPeriodicWave() { return {}; }
}
globalThis.window = { AudioContext: FakeAudioContext };

const { AudioEngine, harmonicAmplitudes } = await import("../js/audio.js");
const { INSTRUMENTS } = await import("../js/instruments.js");

test("harmonicAmplitudes: Teiltöne über der halben Abtastrate entfallen", () => {
  const amplitudes = harmonicAmplitudes(INSTRUMENTS.piano, 5000, 24000);
  assert.ok(amplitudes[1] > 0);
  assert.ok(amplitudes[4] > 0);
  assert.equal(amplitudes[5], 0);
  assert.equal(amplitudes[6], 0);
});

test("noteOn legt eine Stimme an, noteOff lässt sie ausklingen und vergisst sie", () => {
  const engine = new AudioEngine("piano");
  engine.noteOn(60, 261);
  const voice = engine.voices.get(60);
  assert.equal(voice.osc.started, 0);
  assert.deepEqual(voice.osc.frequency.calls[0], ["setValueAtTime", 261, 0]);

  engine.ctx.currentTime = 2;
  engine.noteOff(60);
  assert.equal(engine.voices.has(60), false);
  assert.deepEqual(voice.gain.gain.calls.at(-1), ["exponentialRampToValueAtTime", 0.001, 2 + INSTRUMENTS.piano.releaseTime]);
  assert.equal(voice.osc.stopped, 2 + INSTRUMENTS.piano.releaseTime + 0.02);
});

test("Instrumentwechsel (Vorgabe): neue Stimme mit neuem Lautstärkeregler und fester Lautstärke", () => {
  const engine = new AudioEngine("piano");
  engine.noteOn(60, 261);
  const before = engine.voices.get(60);

  engine.ctx.currentTime = 0.5;
  engine.setInstrument("pad");
  const after = engine.voices.get(60);

  assert.notEqual(after.gain, before.gain);
  assert.equal(before.osc.stopped, 0.52);
  assert.equal(after.envelope.attackTime, 0);
  assert.equal(after.envelope.sustainGain, after.envelope.startGain);
});

test("Instrumentwechsel mit softSwitch (K2.1): Regler und Verlauf bleiben, nur der Oszillator wird überblendet", () => {
  const engine = new AudioEngine("piano", { softSwitch: true });
  engine.noteOn(60, 261);
  const voice = engine.voices.get(60);
  const { gain, envelope, osc: oldOsc } = voice;
  const gainCalls = gain.gain.calls.length;

  engine.ctx.currentTime = 0.5;
  engine.setInstrument("pad");

  assert.equal(engine.voices.get(60), voice);
  assert.equal(voice.gain, gain);
  assert.equal(voice.envelope, envelope);
  assert.equal(gain.gain.calls.length, gainCalls);

  assert.notEqual(voice.osc, oldOsc);
  assert.equal(voice.osc.started, 0.5);
  assert.deepEqual(voice.osc.frequency.calls[0], ["setValueAtTime", 261, 0.5]);
  assert.equal(oldOsc.stopped, 0.5 + 0.03 + 0.02);

  // Beide Oszillatoren hängen über je einen Überblend-Regler am Lautstärkeregler der Stimme.
  const [fadeOut] = oldOsc.connectedTo;
  const [fadeIn] = voice.osc.connectedTo;
  assert.deepEqual(fadeOut.connectedTo, [gain]);
  assert.deepEqual(fadeIn.connectedTo, [gain]);
  assert.deepEqual(fadeOut.gain.calls, [["setValueAtTime", 1, 0.5], ["linearRampToValueAtTime", 0, 0.53]]);
  assert.deepEqual(fadeIn.gain.calls, [["setValueAtTime", 0, 0.5], ["linearRampToValueAtTime", 1, 0.53]]);
});

test("softSwitch: Loslassen nach dem Wechsel beendet den neuen Oszillator", () => {
  const engine = new AudioEngine("piano", { softSwitch: true });
  engine.noteOn(60, 261);
  engine.ctx.currentTime = 0.5;
  engine.setInstrument("pad");
  const voice = engine.voices.get(60);

  engine.ctx.currentTime = 1;
  engine.noteOff(60);
  assert.equal(voice.osc.stopped, 1 + INSTRUMENTS.pad.releaseTime + 0.02);
});
