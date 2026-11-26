// Z7: Service Worker, damit Reinklang ohne Netz startet. Regel: zuerst aus dem Netz (neueste Fassung, wird
// gespeichert); antwortet das Netz nicht binnen WAIT_MS oder gar nicht, die gespeicherte Fassung.
// Läuft nur über https:// oder localhost. Umstellung auf „zuerst aus dem Speicher“ beim Beiseitelegen: Z16.
const CACHE = "reinklang";
const WAIT_MS = 3000;

// Alle Dateien der Seite, beim Einrichten gespeichert, damit sie nach dem ersten Öffnen ohne Netz läuft.
// Neue Dateien hier eintragen; tests/sw.test.js prüft das für index.html, css/, js/ und icons/.
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/audio.js",
  "js/computerkeys.js",
  "js/diagnose.js",
  "js/harmony.js",
  "js/installed.js",
  "js/instruments.js",
  "js/keyboard.js",
  "js/main.js",
  "js/options.js",
  "js/orientation.js",
  "js/player.js",
  "js/selectlist.js",
  "js/state.js",
  "js/steps.js",
  "js/tuning.js",
  "js/version.js",
  "js/wakelock.js",
  "js/zoom.js",
  "icons/apple-touch-icon.png",
  "icons/symbol-192.png",
  "icons/symbol-512.png",
  "icons/symbol.svg"
];

self.addEventListener("install", event => {
  // `no-cache`: am Browser-Zwischenspeicher vorbei beim Server nachfragen, damit nichts Altes gespeichert wird.
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(FILES.map(file => new Request(file, { cache: "no-cache" })))));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  // Über die Adresse statt über `request`: Chrome lehnt eine Seitenanfrage (mode „navigate“) mit Zusatzangaben
  // ab. `no-cache`: am Browser-Zwischenspeicher vorbei beim Server nachfragen (GitHub Pages: 10 min).
  const network = fetch(request.url, { cache: "no-cache" }).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  try {
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), WAIT_MS));
    const response = await Promise.race([network, timeout]);
    if (response) return response;
  } catch {
    // ohne Netz: weiter mit der gespeicherten Fassung
  }
  // `ignoreSearch`: auch ?layout=… oder ?diagnose=1 finden die gespeicherte Seite.
  const cached = await cache.match(request, { ignoreSearch: true });
  return cached || network;
}
