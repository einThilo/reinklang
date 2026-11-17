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
  if (!Object.prototype.hasOwnProperty.call(state, key)) throw new Error(`Unbekannter Wert in state: ${key}`);
}

// Grenzen der Werte. `max` darf von den übrigen Werten abhängen; `integer` rundet auf ganze Zahlen.
// Die Reihenfolge zählt: Werte, von denen andere abhängen, stehen davor.
export const LIMITS = {
  a4Frequency: { min: 220, max: 880 },
  transpose: { min: -12, max: 12, integer: true },
  rootMidi: { min: 0, max: 127, integer: true },
  keyboardStartMidi: { min: 0, max: 127, integer: true },
  keyboardKeyCount: { min: 1, max: values => 128 - values.keyboardStartMidi, integer: true }
};

function limit(key, value, values) {
  const rule = LIMITS[key];
  const max = typeof rule.max === "function" ? rule.max(values) : rule.max;
  const rounded = rule.integer ? Math.round(value) : value;
  return Math.max(rule.min, Math.min(max, rounded));
}

// Setzt mehrere Werte auf einmal, setzt Werte außerhalb ihrer Grenzen auf die Grenze und
// benachrichtigt erst, wenn alle gesetzt sind: je geänderten Wert einmal, in der Reihenfolge von `state`.
// Zuhörer bekommen den Namen, den neuen und den vorherigen Wert.
export function setStates(changes) {
  Object.keys(changes).forEach(checkKey);

  const next = { ...state, ...changes };
  for (const key of Object.keys(LIMITS)) {
    // Was keine Zahl ist (auch `NaN`), wird nicht übernommen; der bisherige Wert bleibt.
    if (typeof next[key] !== "number" || Number.isNaN(next[key])) next[key] = state[key];
    next[key] = limit(key, next[key], next);
  }

  const changed = Object.keys(state).filter(key => next[key] !== state[key]);
  const previous = Object.fromEntries(changed.map(key => [key, state[key]]));
  changed.forEach(key => { state[key] = next[key]; });

  changed.forEach(key => {
    listeners.forEach(listener => listener(key, state[key], previous[key]));
  });
}

// Setzt einen Wert, siehe `setStates`.
export function setState(key, value) {
  setStates({ [key]: value });
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
