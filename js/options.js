// Schalter für Prototypen aus der Adresse (?name=wert). Es gelten nur die hier genannten Namen
// und Werte; alles andere ergibt null, also die Vorgabe. Beschreibung je Schalter: docs/aufgaben/<ID>.md.
// `diagnose` und `layout` werden in diagnose.js bzw. main.js gelesen.
export const SWITCHES = {
  // Z3.4: Laufschrift im gewählten Eintrag der Intervall-Liste waagrecht statt senkrecht.
  laufschrift: ["quer"]
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
