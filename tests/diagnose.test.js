import { test } from "node:test";
import assert from "node:assert/strict";

// Attrappen für die Seite: merken sich die angemeldeten Zuhörer.
function fakePage(search) {
  const windowListeners = {};
  const documentListeners = {};
  // Neuere Node-Versionen haben ein eigenes `navigator`, das sich nicht einfach zuweisen lässt.
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define("location", { search, protocol: "http:" });
  define("navigator", { userAgent: "Testbrowser" });
  define("window", { addEventListener: (type, fn) => { windowListeners[type] = fn; } });
  define("document", {
    addEventListener: (type, fn) => { documentListeners[type] = fn; },
    querySelectorAll: () => []
  });
  return { windowListeners, documentListeners };
}

test("ohne ?diagnose=1 tut das Skript nichts", async () => {
  const page = fakePage("?layout=band");
  await import("../js/diagnose.js?ohne");
  assert.equal(window.reinklangDiagnose, undefined);
  assert.deepEqual(Object.keys(page.windowListeners), []);
  assert.deepEqual(Object.keys(page.documentListeners), []);
});

test("mit ?diagnose=1: Fehler, Meldungen und Finger erscheinen in den Zeilen", async () => {
  const page = fakePage("?layout=band&diagnose=1");
  await import("../js/diagnose.js?mit");
  const diagnose = window.reinklangDiagnose;

  assert.ok(diagnose.lines().includes("main.js: nicht gestartet"));
  assert.ok(diagnose.lines().includes("Fehler: keine"));

  diagnose.report("main.js", "gestartet");
  diagnose.report("Klang", () => "running");
  page.windowListeners.error({ message: "x is not defined", filename: "http://a/js/main.js", lineno: 7 });
  page.windowListeners.error({ target: { src: "http://a/js/fehlt.js" } });
  page.documentListeners.pointerdown();
  page.documentListeners.pointerdown();
  page.documentListeners.pointerup();

  const lines = diagnose.lines();
  assert.ok(lines.includes("main.js: gestartet"));
  assert.ok(lines.includes("Klang: running"));
  assert.ok(lines.includes("Finger: 1"));
  assert.ok(lines.includes("x is not defined (main.js:7)"));
  assert.ok(lines.includes("Laden fehlgeschlagen: http://a/js/fehlt.js"));
});
