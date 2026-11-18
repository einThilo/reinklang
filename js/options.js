// Schalter für Prototypen aus der Adresse (?name=wert). Es gelten nur die hier genannten Namen
// und Werte; alles andere ergibt null, also die Vorgabe. Beschreibung je Schalter: docs/PROTOTYPEN.md.
// Derzeit gibt es keine Schalter (W5.1 `wach` ist seit 2026-11-18 Vorgabe); `diagnose` und `layout`
// werden in diagnose.js bzw. main.js gelesen.
export const SWITCHES = {};

export function readOptions(search, switches = SWITCHES) {
  const params = new URLSearchParams(search);
  const options = {};
  for (const [name, values] of Object.entries(switches)) {
    const value = params.get(name);
    options[name] = values.includes(value) ? value : null;
  }
  return options;
}
