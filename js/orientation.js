// L10: Querformat im Browser erzwingen (seit 2026-11-25 Vorgabe). Ist das Fenster deutlich höher als
// breit, wird die App um 90° im Uhrzeigersinn gedreht: Ihre Oberkante liegt dann am rechten
// Bildschirmrand, wie beim Android-Querformat, wenn man das Handy gegen den Uhrzeigersinn dreht.
// Die Lage des Geräts wird nicht abgefragt, es zählt nur das Seitenverhältnis des Fensters.

// Etwas Spielraum, damit fast quadratische Fenster nicht hin- und herspringen.
export const PORTRAIT_TOLERANCE = 1.05;

export function shouldRotate(width, height) {
  return height > width * PORTRAIT_TOLERANCE;
}

// Setzt am <body> die Klasse `rotated` und die Fenstermaße als CSS-Variablen (--win-w, --win-h),
// bei jeder Größenänderung neu. `win` und `doc` werden übergeben, damit es sich ohne Browser testen lässt.
export function keepLandscape(win, doc) {
  function update() {
    const width = win.innerWidth;
    const height = win.innerHeight;
    doc.body.style.setProperty("--win-w", width + "px");
    doc.body.style.setProperty("--win-h", height + "px");
    doc.body.classList.toggle("rotated", shouldRotate(width, height));
  }
  win.addEventListener("resize", update);
  update();
  return update;
}

// Im Vollbild erlauben manche Browser (Chrome unter Android), das Querformat zu sperren; sonst geschieht nichts.
export async function lockLandscape(screen = globalThis.screen) {
  if (typeof screen?.orientation?.lock !== "function") return false;
  try {
    await screen.orientation.lock("landscape");
    return true;
  } catch {
    return false;
  }
}
