// Hält den Bildschirm wach, solange die Seite sichtbar ist (Prototyp W5.1, `?wach=1`).
// Der Browser gibt die Sperre frei, sobald die Seite verdeckt wird; beim Zurückkehren wird sie neu
// angefordert. Ohne Unterstützung (z. B. über `http://`) geschieht nichts.
// `nav` und `doc` sind `navigator` und `document`; sie werden übergeben, damit sich das ohne Browser testen lässt.
export function keepScreenAwake(nav, doc) {
  let lock = null;
  const isActive = () => lock !== null && !lock.released;

  if (!nav.wakeLock) return { supported: false, isActive };

  async function request() {
    if (doc.visibilityState !== "visible" || isActive()) return;
    try {
      lock = await nav.wakeLock.request("screen");
    } catch {
      lock = null;
    }
  }

  doc.addEventListener("visibilitychange", request);
  request();

  return { supported: true, isActive };
}
