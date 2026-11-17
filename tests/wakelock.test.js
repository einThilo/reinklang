import { test } from "node:test";
import assert from "node:assert/strict";
import { keepScreenAwake } from "../js/wakelock.js";

// Attrappen: `requests` zählt die Anforderungen, `locks` sind die vergebenen Sperren.
function createFakes({ supported = true, fail = false } = {}) {
  const requests = [];
  const locks = [];
  const listeners = {};
  const nav = supported ? {
    wakeLock: {
      request: async type => {
        requests.push(type);
        if (fail) throw new Error("nicht erlaubt");
        const lock = { released: false };
        locks.push(lock);
        return lock;
      }
    }
  } : {};
  const doc = {
    visibilityState: "visible",
    addEventListener: (type, fn) => { listeners[type] = fn; }
  };
  return { nav, doc, requests, locks, listeners };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("ohne Unterstützung geschieht nichts", () => {
  const { nav, doc, listeners } = createFakes({ supported: false });
  const awake = keepScreenAwake(nav, doc);
  assert.equal(awake.supported, false);
  assert.equal(awake.isActive(), false);
  assert.deepEqual(Object.keys(listeners), []);
});

test("fordert die Sperre beim Start an", async () => {
  const { nav, doc, requests } = createFakes();
  const awake = keepScreenAwake(nav, doc);
  await settle();
  assert.deepEqual(requests, ["screen"]);
  assert.equal(awake.isActive(), true);
});

test("fordert nach dem Zurückkehren zur Seite neu an, aber nicht doppelt", async () => {
  const { nav, doc, requests, locks, listeners } = createFakes();
  const awake = keepScreenAwake(nav, doc);
  await settle();

  // Seite verdeckt: der Browser gibt die Sperre frei.
  doc.visibilityState = "hidden";
  locks[0].released = true;
  await listeners.visibilitychange();
  assert.equal(requests.length, 1);
  assert.equal(awake.isActive(), false);

  doc.visibilityState = "visible";
  await listeners.visibilitychange();
  assert.equal(requests.length, 2);
  assert.equal(awake.isActive(), true);

  await listeners.visibilitychange();
  assert.equal(requests.length, 2);
});

test("eine abgelehnte Anforderung wirft keinen Fehler", async () => {
  const { nav, doc } = createFakes({ fail: true });
  const awake = keepScreenAwake(nav, doc);
  await settle();
  assert.equal(awake.supported, true);
  assert.equal(awake.isActive(), false);
});
