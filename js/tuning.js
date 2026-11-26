// Eine Stimmung als Textzeile (regeln/stimmung.md): `Name | Wert … Wert`, 12 Werte für die Grade 1 bis 12.
// Ein Wert ist ein Verhältnis (`5/4`, `2`) oder, mit Dezimalpunkt, ein Cent-Wert (`386.31`). Grad 12 ist die Oktave.
const BUILT_IN_LINES = {
  equal: "Equal Temperament | 100.0 200.0 300.0 400.0 500.0 600.0 700.0 800.0 900.0 1000.0 1100.0 1200.0",
  just7Tri: "Just 7 Tri | 16/15 9/8 6/5 5/4 4/3 7/5 3/2 8/5 5/3 9/5 15/8 2/1",
  justHarmonicCarlos: "Just Harmonic Carlos | 17/16 9/8 19/16 5/4 21/16 11/8 3/2 13/8 27/16 7/4 15/8 2/1",
  justSuperCarlos: "Just Super Carlos | 17/16 9/8 6/5 5/4 4/3 11/8 3/2 13/8 5/3 7/4 15/8 2/1",
  thilo: "Thilo | 17/16 9/8 6/5 5/4 4/3 7/5 3/2 8/5 5/3 7/4 15/8 2/1",
  liligetia: "Liligetia | 17/16 9/8 6/5 5/4 11/8 7/5 12/8 8/5 13/8 7/4 15/8 2/1",
  // Nur auf dem Test-Branch zum Ausprobieren der Oktave ≠ 2 (Z3.7), vor dem Übernehmen nach main entfernen.
  // Die Cent-Werte von Thilo mal log2(3), gestreckt wie die Oktave 3/1.
  testStretched: "Test gestreckt | 166.35 323.19 500.28 612.29 789.38 923.26 1112.57 1289.66 1401.68 1535.55 1724.87 3/1"
};

const NAME_PATTERN = /^[\p{L}\p{N} \-_.,()+'#]{1,40}$/u;

// Ein Wert als Frequenzverhältnis, oder null, wenn er nicht lesbar ist.
export function parseTuningValue(text) {
  if (/^-?(\d+\.\d*|\.\d+)$/.test(text)) return Math.pow(2, Number(text) / 1200);
  const match = /^(\d+)(?:\/(\d+))?$/.exec(text);
  if (!match) return null;
  const ratio = Number(match[1]) / Number(match[2] ?? 1);
  return ratio > 0 && Number.isFinite(ratio) ? ratio : null;
}

// Liest eine Zeile. Ergebnis: `{ name, values, ratios }` oder `{ error }`.
// `values` sind die 12 Werte als Text, `ratios` die Verhältnisse der Grade 0 bis 12 (Grad 0 ist 1).
export function parseTuningLine(line) {
  const parts = line.split("|");
  if (parts.length !== 2) return { error: "Name und Werte durch genau ein „|“ trennen" };
  const name = parts[0].trim();
  if (!NAME_PATTERN.test(name)) return { error: `Name ungültig: „${name}“` };
  const values = parts[1].trim().split(/\s+/).filter(Boolean);
  if (values.length !== 12) return { error: `12 Werte nötig, nicht ${values.length}` };
  const ratios = [1];
  for (const value of values) {
    const ratio = parseTuningValue(value);
    if (ratio === null) return { error: `Wert nicht lesbar: „${value}“` };
    ratios.push(ratio);
  }
  if (ratios[12] <= 1) return { error: "Die Oktave (letzter Wert) muss größer als 1 sein" };
  return { name, values, ratios };
}

// Schreibt eine Stimmung als Zeile.
export function formatTuningLine(tuning) {
  return `${tuning.name} | ${tuning.values.join(" ")}`;
}

// Liest einen Text mit einer Stimmung je Zeile; leere Zeilen zählen nicht. Ergebnis je Zeile wie `parseTuningLine`.
export function parseTuningText(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").map(parseTuningLine);
}

export const TUNINGS = Object.fromEntries(Object.entries(BUILT_IN_LINES).map(([key, line]) => {
  const tuning = parseTuningLine(line);
  if (tuning.error) throw new Error(`Stimmung ${key}: ${tuning.error}`);
  return [key, tuning];
}));

// Eigene Stimmungen (Z3.4) liegen in `state.customTunings` unter einem Schlüssel `own:<Name>`, getrennt von den
// fest hinterlegten, damit diese nie überschrieben werden.
export const CUSTOM_PREFIX = "own:";

export function customTuningKey(name) {
  return CUSTOM_PREFIX + name;
}

// Stimmung zu einem Schlüssel: eigene oder fest hinterlegte, sonst undefined.
export function findTuning(key, customTunings = {}) {
  if (key.startsWith(CUSTOM_PREFIX)) return customTunings[key];
  return Object.prototype.hasOwnProperty.call(TUNINGS, key) ? TUNINGS[key] : undefined;
}

const ADJUSTED_SUFFIX = " (angepasst)";

// Kopie einer Stimmung zum Anpassen, Name „Name (angepasst)“; der Name wird gekürzt, damit er höchstens 40 Zeichen
// hat. Eine Kopie behält ihren Namen.
export function adjustedCopy(tuning) {
  const name = tuning.name.endsWith(ADJUSTED_SUFFIX)
    ? tuning.name
    : tuning.name.slice(0, 40 - ADJUSTED_SUFFIX.length).trim() + ADJUSTED_SUFFIX;
  return { name, values: [...tuning.values], ratios: [...tuning.ratios] };
}

// Neue Stimmung, in der Grad `degree` (1 bis 11) den Wert `value` (Text wie in einer Zeile) hat.
// Grad 0 ist immer 1, Grad 12 (Oktave) wird hier nicht geändert.
export function withDegreeValue(tuning, degree, value) {
  if (!Number.isInteger(degree) || degree < 1 || degree > 11) throw new Error(`Grad ${degree} nicht änderbar`);
  const ratio = parseTuningValue(value);
  if (ratio === null) throw new Error(`Wert nicht lesbar: „${value}“`);
  const values = [...tuning.values];
  const ratios = [...tuning.ratios];
  values[degree - 1] = value;
  ratios[degree] = ratio;
  return { name: tuning.name, values, ratios };
}

// Freie Cent-Eingabe als Wert: begrenzt auf 0–1200, zwei Nachkommastellen (`386.00`). Keine Zahl ergibt null.
export function centsToValue(cents) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return Math.max(0, Math.min(1200, cents)).toFixed(2);
}

// Frequenz eines Tons. Gleichstufig ist Ton n = Stimmton · O^((n − 69)/12) mit dem Oktavverhältnis O der
// Stimmung; der Grundton ist einer dieser Töne, ein Ton auf Grad g, k Oktaven darüber, ist Grundton · Wert[g] · O^k.
// Eine unbekannte Stimmung rechnet gleichstufig mit O = 2. `settings.customTunings` sind die eigenen Stimmungen.
export function midiToFrequency(midi, settings) {
  const tuning = findTuning(settings.tuningMode, settings.customTunings);
  if (!tuning) {
    return getEqualTemperamentFrequency(midi, settings.a4Frequency, 2);
  }
  return getTunedFrequency(midi, tuning.ratios, settings);
}

// Frequenz eines Tons aus den Einstellungen (`a4Frequency`, `tuningMode`, `customTunings`, `useTuning`,
// `rootMidi`). Ist das Tuning aus, gilt gleichstufig mit Oktave 2.
export function frequencyFromState(midi, state) {
  if (!state.useTuning) {
    return getEqualTemperamentFrequency(midi, state.a4Frequency, 2);
  }
  return midiToFrequency(midi, {
    a4Frequency: state.a4Frequency,
    tuningMode: state.tuningMode,
    customTunings: state.customTunings,
    tuningRootMidi: state.rootMidi
  });
}

// Abweichung eines Tons von gleichstufig in Cent (100 Cent = ein Halbton), aus denselben Einstellungen wie
// `frequencyFromState`. Gleichstufig mit dem Oktavverhältnis der Stimmung; ohne Tuning ist sie 0.
export function centsFromEqual(midi, state) {
  const octave = state.useTuning ? findTuning(state.tuningMode, state.customTunings)?.ratios[12] ?? 2 : 2;
  const equal = getEqualTemperamentFrequency(midi, state.a4Frequency, octave);
  return 1200 * Math.log2(frequencyFromState(midi, state) / equal);
}

// Lage der Abweichungs-Linie auf einer Taste in Prozent der Tastenbreite:
// Mitte = 0 Cent, Ränder = ±50 Cent, größere Abweichungen bleiben am Rand.
export function deviationPosition(cents) {
  return Math.max(0, Math.min(100, 50 + cents));
}

// Abweichung als Text mit Vorzeichen, ohne Angabe in ganzen Cent („+2“, „−14“, „0“), sonst mit `digits`
// Nachkommastellen („−13.69“, „0.00“).
export function formatCents(cents, digits = 0) {
  const text = Math.abs(cents).toFixed(digits);
  if (Number(text) === 0) return text;
  return (cents > 0 ? "+" : "−") + text;
}

function getEqualTemperamentFrequency(midi, a4Frequency, octave) {
  return a4Frequency * Math.pow(octave, (midi - 69) / 12);
}

function getTunedFrequency(midi, ratios, settings) {
  const octave = ratios[12];
  const diff = midi - settings.tuningRootMidi;
  const degree = ((diff % 12) + 12) % 12;
  const octaveShift = Math.floor(diff / 12);
  const rootFreq = getEqualTemperamentFrequency(settings.tuningRootMidi, settings.a4Frequency, octave);
  return rootFreq * ratios[degree] * Math.pow(octave, octaveShift);
}
