// Einstellungen an einer Stelle. Lesen über `state`, ändern nur über `setState`.
export const state = {
  rootMidi: 60,
  harmonyMode: "lowest",
  tuningMode: "thilo",
  useTuning: false,
  a4Frequency: 440
};

const listeners = [];

// Setzt einen Wert und benachrichtigt alle Zuhörer, aber nur bei echter Änderung.
export function setState(key, value) {
  if (state[key] === value) return;
  state[key] = value;
  listeners.forEach(listener => listener(key, value));
}

export function onStateChange(listener) {
  listeners.push(listener);
}
