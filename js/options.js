// Schalter für Prototypen aus der Adresse (?name=wert). Es gelten nur die hier genannten Namen
// und Werte; alles andere ergibt null, also die Vorgabe. Beschreibung je Schalter: docs/PROTOTYPEN.md.
export const SWITCHES = {
  sustain: ["pedal"],
  grundton: ["haeuser"],
  abweichung: ["1"],
  wach: ["1"]
};

export function readOptions(search) {
  const params = new URLSearchParams(search);
  const options = {};
  for (const [name, values] of Object.entries(SWITCHES)) {
    const value = params.get(name);
    options[name] = values.includes(value) ? value : null;
  }
  return options;
}
