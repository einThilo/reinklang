// Schalter für Prototypen aus der Adresse (?name=wert). Es gelten nur die hier genannten Namen
// und Werte; alles andere ergibt null, also die Vorgabe. Beschreibung je Schalter: docs/aufgaben/<ID>.md.
// `diagnose` und `layout` werden in diagnose.js bzw. main.js gelesen.
export const SWITCHES = {
  // K8: lauter am Handy (Pegel mit härterem Begrenzer, Obertöne tiefer Töne, oder beides).
  laut: ["pegel", "bass", "beides"]
};

export function readOptions(search, switches = SWITCHES) {
  const params = new URLSearchParams(search);
  const options = {};
  for (const [name, values] of Object.entries(switches)) {
    const value = params.get(name);
    options[name] = values.includes(value) ? value : null;
  }
  return options;
}
