export const TUNINGS = {
  equal: {
    name: "Equal Temperament",
    ratios: null
  },
  just7Tri: {
    name: "Just 7 Tri",
    ratios: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8]
  },
  justHarmonicCarlos: {
    name: "Just Harmonic Carlos",
    ratios: [1, 17 / 16, 9 / 8, 19 / 16, 5 / 4, 21 / 16, 11 / 8, 3 / 2, 13 / 8, 27 / 16, 7 / 4, 15 / 8]
  },
  justSuperCarlos: {
    name: "Just Super Carlos",
    ratios: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 11 / 8, 3 / 2, 13 / 8, 5 / 3, 7 / 4, 15 / 8]
  },
  thilo: {
    name: "Thilo",
    ratios: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 7 / 4, 15 / 8]
  },
  liligetia: {
    name: "Liligetia",
    ratios: [1, 17 / 16, 9 / 8, 6 / 5, 5 / 4, 11 / 8, 7 / 5, 12 / 8, 8 / 5, 13 / 8, 7 / 4, 15 / 8]
  }
};

export function midiToFrequency(midi, settings) {
  const tuning = TUNINGS[settings.tuningMode];
  if (!tuning || !tuning.ratios) {
    return getEqualTemperamentFrequency(midi, settings);
  }
  return getTunedFrequency(midi, tuning.ratios, settings);
}

// Frequenz eines Tons aus den Einstellungen (`a4Frequency`, `tuningMode`, `useTuning`, `rootMidi`).
// Ist „Use tuning“ aus, gilt die gleichstufige Stimmung.
export function frequencyFromState(midi, state) {
  return midiToFrequency(midi, {
    a4Frequency: state.a4Frequency,
    tuningMode: state.useTuning ? state.tuningMode : "equal",
    tuningRootMidi: state.rootMidi
  });
}

// Abweichung eines Tons von der gleichstufigen Stimmung in Cent (100 Cent = ein Halbton),
// aus denselben Einstellungen wie `frequencyFromState`. Ohne „Use tuning“ ist sie 0.
export function centsFromEqual(midi, state) {
  return 1200 * Math.log2(frequencyFromState(midi, state) / getEqualTemperamentFrequency(midi, state));
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

function getEqualTemperamentFrequency(midi, settings) {
  return settings.a4Frequency * Math.pow(2, (midi - 69) / 12);
}

function getTunedFrequency(midi, ratios, settings) {
  const diff = midi - settings.tuningRootMidi;
  const degree = ((diff % 12) + 12) % 12;
  const octaveShift = Math.floor(diff / 12);
  const rootFreq = getEqualTemperamentFrequency(settings.tuningRootMidi, settings);
  return rootFreq * ratios[degree] * Math.pow(2, octaveShift);
}
