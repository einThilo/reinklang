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
  suspend() { this.state = "suspended"; }
  resume() { this.state = "running"; }
}
globalThis.window = { AudioContext: FakeAudioContext };

const { AudioEngine, harmonicAmplitudes, preferPlayback } = await import("../js/audio.js");
const { INSTRUMENTS } = await import("../js/instruments.js");

test("preferPlayback: setzt die Audio-Sitzung auf playback, wo es sie gibt (Z13)", () => {
  const nav = { audioSession: { type: "auto" } };
  preferPlayback(nav);
  assert.equal(nav.audioSession.type, "playback");
  assert.doesNotThrow(() => preferPlayback({}));
  assert.doesNotThrow(() => preferPlayback(undefined));
});

test("harmonicAmplitudes: Teiltöne über der halben Abtastrate entfallen", () => {
  const amplitudes = harmonicAmplitudes(INSTRUMENTS.piano, 5000, 24000);
  assert.ok(amplitudes[1] > 0);
  assert.ok(amplitudes[4] > 0);
  assert.equal(amplitudes[5], 0);
  assert.equal(amplitudes[6], 0);
});

// Engine mit von Hand ausgelösten Zeitgebern: `run()` führt alle fälligen aus.
function makeEngine(instrument = "piano") {
  const engine = new AudioEngine(instrument);
  const timers = [];
  engine.schedule = fn => timers.push(fn);
  engine.run = () => { for (const fn of timers.splice(0)) fn(); };
  return engine;
}

test("noteOn legt eine Stimme an; noteOff lässt sie ausklingen, danach wird sie beendet", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261);
  const voice = engine.voiceAt(60);
  assert.equal(voice.osc.started, 0);
  assert.deepEqual(voice.osc.frequency.calls[0], ["setValueAtTime", 261, 0]);

  engine.ctx.currentTime = 2;
  engine.noteOff(60);
  assert.deepEqual(voice.gain.gain.calls.at(-1), ["exponentialRampToValueAtTime", 0.001, 2 + INSTRUMENTS.piano.releaseTime]);
  assert.equal(engine.voiceAt(60), voice);       // bleibt während des Ausklangs auf seinem Platz
  assert.equal(voice.osc.stopped, null);

  engine.ctx.currentTime = 2 + INSTRUMENTS.piano.releaseTime + 0.05;
  engine.run();
  assert.notEqual(voice.osc.stopped, null);
  assert.equal(engine.voices.has(60), false);
});

test("Drücken während des Ausklangs schlägt dieselbe Stimme neu an, ab ihrer aktuellen Lautstärke", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261);
  const voice = engine.voiceAt(60);
  engine.ctx.currentTime = 1;
  engine.noteOff(60);

  engine.ctx.currentTime = 1.3;
  engine.noteOn(60, 261);
  assert.equal(engine.voiceAt(60), voice);
  const start = voice.envelope.startGain;
  assert.ok(start > 0.001 && start < INSTRUMENTS.piano.sustainGain);
  assert.deepEqual(voice.gain.gain.calls.slice(-3)[0], ["exponentialRampToValueAtTime", start, 1.3]);
  assert.deepEqual(voice.gain.gain.calls.at(-2), ["linearRampToValueAtTime", 1, 1.3 + INSTRUMENTS.piano.attackTime]);

  // Der Zeitgeber des ersten Loslassens beendet die neu angeschlagene Stimme nicht.
  engine.ctx.currentTime = 3;
  engine.run();
  assert.equal(voice.osc.stopped, null);
  assert.equal(engine.voiceAt(60), voice);
});

test("Erneut losgelassen nach Neu-Anschlag: beendet erst nach dem zweiten Ausklang", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261);
  engine.ctx.currentTime = 1;
  engine.noteOff(60);
  engine.ctx.currentTime = 1.3;
  engine.noteOn(60, 261);
  engine.ctx.currentTime = 1.5;
  engine.noteOff(60);
  const voice = engine.voiceAt(60);

  engine.ctx.currentTime = 1.85;                 // nach dem ersten, vor dem zweiten Ausklangsende
  engine.run();
  assert.equal(voice.osc.stopped, null);
  engine.ctx.currentTime = 1.5 + INSTRUMENTS.piano.releaseTime;
  engine.run();
  assert.notEqual(voice.osc.stopped, null);
  assert.equal(engine.voices.has(60), false);
});

test("Instrument im Ausklang gewechselt: neue Stimme, der alte Ausklang läuft zu Ende", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261);
  const old = engine.voiceAt(60);
  engine.ctx.currentTime = 1;
  engine.noteOff(60);
  engine.setInstrument("pad");

  engine.ctx.currentTime = 1.3;
  engine.noteOn(60, 261);
  const fresh = engine.voiceAt(60);
  assert.notEqual(fresh, old);
  assert.equal(fresh.instrumentKey, "pad");
  assert.equal(old.osc.stopped, null);

  engine.ctx.currentTime = 1 + INSTRUMENTS.piano.releaseTime + 0.05;
  engine.run();
  assert.notEqual(old.osc.stopped, null);
  assert.equal(fresh.osc.stopped, null);
  assert.equal(engine.voiceAt(60), fresh);
});

test("Instrumentwechsel lässt klingende Stimmen unverändert; Neu-Anschlag und Ausklang mit ihrem Instrument", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261);
  const voice = engine.voiceAt(60);
  const callsBefore = voice.gain.gain.calls.length;

  engine.ctx.currentTime = 0.5;
  engine.setInstrument("pad");
  assert.equal(voice.gain.gain.calls.length, callsBefore);

  engine.noteOn(60, 261);
  assert.equal(engine.voiceAt(60), voice);
  assert.equal(voice.envelope.attackTime, INSTRUMENTS.piano.attackTime);

  engine.ctx.currentTime = 1;
  engine.noteOff(60);
  assert.equal(voice.releaseEnd, 1 + INSTRUMENTS.piano.releaseTime);
});

test("Haltestimme und Spielstimme einer Taste sind getrennt", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261, "halte");
  engine.setInstrument("pad");
  engine.noteOn(60, 261, "spiel");
  const halte = engine.voiceAt(60, "halte");
  const spiel = engine.voiceAt(60, "spiel");
  assert.notEqual(halte, spiel);
  assert.equal(halte.instrumentKey, "piano");
  assert.equal(spiel.instrumentKey, "pad");

  engine.ctx.currentTime = 1;
  engine.noteOff(60, "spiel");
  assert.equal(halte.releaseEnd, null);
  engine.ctx.currentTime = 3;
  engine.run();
  assert.equal(engine.voiceAt(60, "spiel"), undefined);
  assert.equal(engine.voiceAt(60, "halte"), halte);
});

test("promoteSpiel: die Spielstimme wird Haltestimme, die bisherige Haltestimme klingt aus (K6 Regel 7)", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261, "halte");
  engine.noteOn(60, 261, "spiel");
  const halte = engine.voiceAt(60, "halte");
  const spiel = engine.voiceAt(60, "spiel");

  engine.ctx.currentTime = 1;
  engine.promoteSpiel(60);
  assert.equal(engine.voiceAt(60, "halte"), spiel);
  assert.equal(engine.voiceAt(60, "spiel"), undefined);
  assert.equal(halte.releaseEnd, 1 + INSTRUMENTS.piano.releaseTime);

  engine.ctx.currentTime = 3;
  engine.run();
  assert.notEqual(halte.osc.stopped, null);
  assert.equal(spiel.osc.stopped, null);
  assert.equal(engine.voiceAt(60, "halte"), spiel);
});

test("Umstimmen erfasst klingende Stimmen beider Plätze", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261, "halte");
  engine.noteOn(60, 261, "spiel");
  engine.retuneAllVoices(() => 264);
  assert.equal(engine.voiceAt(60, "halte").baseFrequency, 264);
  assert.equal(engine.voiceAt(60, "spiel").baseFrequency, 264);
});

test("Wellenform: innerhalb eines Halbtons wiederverwendet, bei anderer Tonhöhe derselben Taste neu berechnet (K5)", () => {
  const engine = makeEngine();
  const waveOf = frequency => {
    engine.noteOn(60, frequency);
    const wave = engine.voiceAt(60).osc.wave;
    engine.noteOff(60);
    engine.ctx.currentTime += 2;               // Ausklang vorbei: nächstes Drücken legt eine neue Stimme an
    engine.run();
    return wave;
  };

  const at261 = waveOf(261.63);
  assert.equal(waveOf(261.63), at261);
  assert.equal(waveOf(264), at261);          // rein gestimmt, wenige Cent daneben
  assert.notEqual(waveOf(130.81), at261);    // Stimmton 220 statt 440: eine Oktave tiefer
});

test("S19: silence blendet aus, beendet alle Stimmen und hält den Klang an; ensureStarted setzt fort", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261);
  engine.noteOn(64, 329, "spiel");
  const voices = [engine.voiceAt(60), engine.voiceAt(64, "spiel")];

  engine.silence();
  assert.deepEqual(engine.master.gain.calls.at(-1), ["linearRampToValueAtTime", 0, 0.05]);
  engine.run();

  assert.ok(voices.every(voice => voice.finished && voice.osc.stopped !== null));
  assert.equal(engine.voiceAt(60), undefined);
  assert.equal(engine.ctx.state, "suspended");
  assert.equal(engine.master.gain.value, 0.6);

  engine.ensureStarted();
  assert.equal(engine.ctx.state, "running");
});

test("S19: ein Anschlag vor dem Anhalten bricht silence ab", () => {
  const engine = makeEngine();
  engine.noteOn(60, 261);
  engine.silence();
  engine.noteOn(62, 293);
  engine.run();
  assert.equal(engine.ctx.state, "running");
  assert.ok(engine.voiceAt(62));
  assert.deepEqual(engine.master.gain.calls.at(-1), ["setValueAtTime", 0.6, 0]);
});

// --- K8 ---
test("K8: doppelter Pegel mit hartem Begrenzer ab −12 dB", () => {
  const engine = new AudioEngine("piano");
  engine.ensureStarted();
  assert.equal(engine.master.gain.value, 0.6);
  assert.equal(engine.limiter.threshold.value, -12);
});
