// Z7: Läuft die Seite als installierte App vom Startbildschirm? Android meldet das über die Anzeigeart
// aus dem Manifest, iOS über `navigator.standalone`. Nur beim Start fragen: Im Browser zählt auch ein
// über ⛶ eingeschaltetes Vollbild als „fullscreen“.
export function isInstalledApp(win = window) {
  const mode = "(display-mode: fullscreen), (display-mode: standalone)";
  return Boolean(win.matchMedia?.(mode).matches || win.navigator?.standalone === true);
}
