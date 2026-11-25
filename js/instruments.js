export const INSTRUMENTS = {
  pad: {
    name: "Ambient-Pad",
    attackTime: 0.15,
    decayTime: 0.3,
    sustainGain: 1,
    releaseTime: 1,
    partialSeries: [
      {
        type: "sine",
        fromPartial: 1,
        untilPartial: 6,
        gainKeyframes: { 50: 0.4, 150: 0.5, 500: 0.6, 2000: 0.4 },
        falloffKeyframes: { 50: 0.2, 500: 0.4, 2000: 0.6 }
      },
      {
        type: "triangle",
        fromPartial: 1,
        untilPartial: 4,
        gainKeyframes: { 50: 0.6, 150: 0.3, 400: 0.1, 800: 0.0 },
        falloffKeyframes: { 50: 0.4, 400: 0.6, 800: 0.8 }
      }
    ]
  },
  piano: {
    name: "E-Piano",
    attackTime: 0.02,
    decayTime: 1.1,
    sustainGain: 0.1,
    releaseTime: 0.8,
    partialSeries: [
      {
        type: "sine",
        fromPartial: 1,
        untilPartial: 6,
        gainKeyframes: { 50: 0.5, 200: 0.6, 1000: 0.5 },
        falloffKeyframes: { 50: 0.3, 500: 0.4 }
      },
      {
        type: "triangle",
        fromPartial: 1,
        untilPartial: 5,
        gainKeyframes: { 50: 0.4, 200: 0.3, 600: 0.0 },
        falloffKeyframes: { 50: 0.5, 500: 0.7 }
      }
    ]
  }
};
