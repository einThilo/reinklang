// Einstellungen an einer Stelle. Lesen über `state`, ändern nur über `setState`.
export const state = {
  rootMidi: 60,
  harmonyMode: "first",
  tuningMode: "thilo",
  useTuning: false,
  a4Frequency: 440,
  transpose: 0,
  instrument: "piano",
  sustain: false,
  keyboardStartMidi: 45,
  keyboardKeyCount: 26
};

const listeners = [];

// Wirft einen Fehler bei einem Namen, den `state` nicht kennt (z. B. Tippfehler im Code).
function checkKey(key) {
  if (!Object.hasOwn(state, key)) throw new Error(`Unbekannter Wert in state: ${key}`);
}

// Setzt einen Wert und benachrichtigt alle Zuhörer, aber nur bei echter Änderung.
// Zuhörer bekommen den Namen, den neuen und den vorherigen Wert.
export function setState(key, value) {
  checkKey(key);
  const previous = state[key];
  if (previous === value) return;
  state[key] = value;
  listeners.forEach(listener => listener(key, value, previous));
}

// Meldet einen Zuhörer an: `onStateChange(listener)` für alle Werte,
// `onStateChange(keys, listener)` nur für die genannten.
export function onStateChange(keysOrListener, listener) {
  if (typeof keysOrListener === "function") {
    listeners.push(keysOrListener);
    return;
  }
  keysOrListener.forEach(checkKey);
  listeners.push((key, value, previous) => {
    if (keysOrListener.includes(key)) listener(key, value, previous);
  });
}
