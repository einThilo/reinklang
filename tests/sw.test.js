import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

// sw.js in einer Attrappe ausführen: `caches` ist eine Map, `fetch` und die Wartezeit stellt der Test.
function loadWorker({ fetchImpl, fireTimeout = false }) {
  const stored = new Map();
  const listeners = {};
  const cache = {
    put: async (request, response) => { stored.set(request.url, response); },
    match: async request => stored.get(request.url.split("?")[0]),
    addAll: async () => {}
  };
  const context = {
    self: {
      location: { origin: "https://example.org" },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting: () => {},
      clients: { claim: async () => {} }
    },
    caches: { open: async () => cache },
    fetch: fetchImpl,
    setTimeout: fn => { if (fireTimeout) setImmediate(fn); },
    Request: class { constructor(url) { this.url = url; } },
    URL
  };
  vm.runInNewContext(source, context);
  const respond = url => new Promise(resolve => listeners.fetch({
    request: { method: "GET", url },
    respondWith: promise => resolve(promise)
  }));
  return { stored, respond };
}

const response = body => ({ ok: true, body, clone: () => response(body) });
const URL_PAGE = "https://example.org/reinklang/";

test("mit Netz: neueste Fassung aus dem Netz, wird gespeichert", async () => {
  const worker = loadWorker({ fetchImpl: async () => response("neu") });
  worker.stored.set(URL_PAGE, response("alt"));
  assert.equal((await worker.respond(URL_PAGE)).body, "neu");
  assert.equal(worker.stored.get(URL_PAGE).body, "neu");
});

test("ohne Netz: gespeicherte Fassung, auch mit ?diagnose=1", async () => {
  const worker = loadWorker({ fetchImpl: async () => { throw new TypeError("offline"); } });
  worker.stored.set(URL_PAGE, response("alt"));
  assert.equal((await worker.respond(URL_PAGE + "?diagnose=1")).body, "alt");
});

test("Netz zu langsam: nach der Wartezeit die gespeicherte Fassung", async () => {
  const worker = loadWorker({ fetchImpl: () => new Promise(() => {}), fireTimeout: true });
  worker.stored.set(URL_PAGE, response("alt"));
  assert.equal((await worker.respond(URL_PAGE)).body, "alt");
});

test("Netz zu langsam und nichts gespeichert: weiter auf das Netz warten", async () => {
  let answer;
  const worker = loadWorker({ fetchImpl: () => new Promise(resolve => { answer = resolve; }), fireTimeout: true });
  const pending = worker.respond(URL_PAGE);
  setTimeout(() => answer(response("spät")), 5);
  assert.equal((await pending).body, "spät");
});

test("Dateiliste enthält alle Dateien der Seite", () => {
  const files = JSON.parse(source.match(/const FILES = (\[[^\]]*\]);/)[1]);
  const expected = ["./", "index.html", "manifest.webmanifest"];
  for (const dir of ["css", "js", "icons"]) {
    for (const name of readdirSync(new URL(`../${dir}/`, import.meta.url))) expected.push(`${dir}/${name}`);
  }
  assert.deepEqual([...files].sort(), expected.sort());
});
