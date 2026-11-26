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
function parseValue(text) {
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
    const ratio = parseValue(value);
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

// Frequenz eines Tons. Gleichstufig ist Ton n = Stimmton · O^((n − 69)/12) mit dem Oktavverhältnis O der
// Stimmung; der Grundton ist einer dieser Töne, ein Ton auf Grad g, k Oktaven darüber, ist Grundton · Wert[g] · O^k.
// Eine unbekannte Stimmung rechnet gleichstufig mit O = 2.
export function midiToFrequency(midi, settings) {
  const tuning = TUNINGS[settings.tuningMode];
  if (!tuning) {
    return getEqualTemperamentFrequency(midi, settings.a4Frequency, 2);
  }
  return getTunedFrequency(midi, tuning.ratios, settings);
}

// Frequenz eines Tons aus den Einstellungen (`a4Frequency`, `tuningMode`, `useTuning`, `rootMidi`).
// Ist das Tuning aus, gilt gleichstufig mit Oktave 2.
export function frequencyFromState(midi, state) {
  if (!state.useTuning) {
    return getEqualTemperamentFrequency(midi, state.a4Frequency, 2);
  }
  return midiToFrequency(midi, {
    a4Frequency: state.a4Frequency,
    tuningMode: state.tuningMode,
    tuningRootMidi: state.rootMidi
  });
}

// Abweichung eines Tons von gleichstufig in Cent (100 Cent = ein Halbton), aus denselben Einstellungen wie
// `frequencyFromState`. Gleichstufig mit dem Oktavverhältnis der Stimmung; ohne Tuning ist sie 0.
export function centsFromEqual(midi, state) {
  const octave = state.useTuning ? TUNINGS[state.tuningMode]?.ratios[12] ?? 2 : 2;
  const equal = getEqualTemperamentFrequency(midi, state.a4Frequency, octave);
  return 1200 * Math.log2(frequencyFromState(midi, state) / equal);
}

// Lage der Abweichungs-Linie auf einer Taste in Prozent der Tastenbreite:
// Mitte = 0 Cent, Ränder = ±50 Cent, größere Abweichungen bleiben am Rand.
export function deviationPosition(cents) {
  return Math.max(0, Math.min(100, 50 + cents));
}

// Abweichung als Text in ganzen Cent mit Vorzeichen, z. B. „+2“, „−14“, „0“.
export function formatCents(cents) {
  const rounded = Math.round(cents);
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `−${-rounded}`;
  return "0";
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
