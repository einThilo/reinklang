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

function getEqualTemperamentFrequency(midi, settings) {
  return settings.a4Frequency * Math.pow(settings.octaveRatio, (midi - 69) / 12);
}

function getTunedFrequency(midi, ratios, settings) {
  const diff = midi - settings.tuningRootMidi;
  const degree = ((diff % 12) + 12) % 12;
  const octaveShift = Math.floor(diff / 12);
  const rootFreq = getEqualTemperamentFrequency(settings.tuningRootMidi, settings);
  return rootFreq * ratios[degree] * Math.pow(settings.octaveRatio, octaveShift);
}
