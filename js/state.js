// Einstellungen an einer Stelle. Lesen über `state`, ändern nur über `setState`.
export const state = {
  rootMidi: 60,
  harmonyMode: "lowest",
  tuningMode: "thilo",
  useTuning: false,
  a4Frequency: 440,
  transpose: 0,
  instrument: "piano"
};

const listeners = [];

// Setzt einen Wert und benachrichtigt alle Zuhörer, aber nur bei echter Änderung.
// Zuhörer bekommen den Namen, den neuen und den vorherigen Wert.
export function setState(key, value) {
  const previous = state[key];
  if (previous === value) return;
  state[key] = value;
  listeners.forEach(listener => listener(key, value, previous));
}

export function onStateChange(listener) {
  listeners.push(listener);
}
