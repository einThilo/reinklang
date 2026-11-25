// S16: Unter iOS kann die Seite trotz der Sperren vergrößert werden (z. B. Safari beim Antippen des
// Zahlenfelds oder Doppeltipp auf eine Auswahlliste, die von der Doppeltipp-Sperre ausgenommen sind).
// Zurück ginge es nur mit zwei Fingern, und die sind gesperrt. Deshalb: Ist die Seite vergrößert, wird
// der Viewport neu gesetzt, was Safari auf Maßstab 1 zurückstellt. Ungeprüft am iOS-Gerät.
// `win` und `doc` sind `window` und `document`; sie werden übergeben, damit sich das ohne Browser testen lässt.
export function undoZoom(win, doc) {
  const viewport = win.visualViewport;
  const meta = doc.querySelector('meta[name="viewport"]');
  if (!viewport || !meta) return { supported: false, scale: () => 1 };

  const content = meta.getAttribute("content");
  let pending = false;

  function check() {
    if (viewport.scale <= 1.01 || pending) return;
    pending = true;
    // Erst ein anderer Wert, dann wieder der alte: Nur eine Änderung bringt Safari dazu, neu zu rechnen.
    meta.setAttribute("content", content + ", width=device-width");
    win.setTimeout(() => {
      meta.setAttribute("content", content);
      pending = false;
    }, 50);
  }

  viewport.addEventListener("resize", check);
  // Nach dem Verlassen des Zahlenfelds (focusout) bleibt Safaris Vergrößerung sonst stehen.
  doc.addEventListener("focusout", () => win.setTimeout(check, 300));
  return { supported: true, scale: () => viewport.scale };
}
