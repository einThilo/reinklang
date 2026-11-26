// Stimmung anpassen (Z3.4): Eine fest hinterlegte Stimmung wird als Kopie „Name (angepasst)“ angepasst, eine eigene
// direkt. Ein Tipp auf ein Haus der Harmonieklaviatur wählt dessen Grad zum Grundton; Grad 0 ist nicht änderbar.
// Die Kopie gilt bis zum Neuladen. Die Intervall-Liste öffnet sich mit dem Tipp auf ein Haus; ein Eintrag gilt
// sofort, ohne eigenen Klang, und die Liste bleibt offen. Sustain, Release und Hauptklaviatur bleiben nutzbar.

import { state, setState, setStates, onStateChange } from "./state.js";
import { TUNINGS, CUSTOM_PREFIX, findTuning, customTuningKey, adjustedCopy, withDegreeValue, centsToValue } from "./tuning.js";
import { INTERVALS, formatIntervalCents, nearestIntervalIndex } from "./intervals.js";

// Wert des Eintrags „Stimmung anpassen“ in der Stimmungsliste; kein Schlüssel einer Stimmung.
export const ADJUST_ENTRY = "adjust";
export const ADJUST_LABEL = "✎ Stimmung anpassen";

// Einträge der Stimmungsliste in ihrer Reihenfolge: eigene Stimmungen oben, dann die fest hinterlegten, zuletzt
// „Stimmung anpassen“. Ein Eintrag: `{ value, name }`.
export function tuningListEntries(customTunings) {
  const own = Object.entries(customTunings).map(([value, tuning]) => ({ value, name: tuning.name }));
  const builtIn = Object.entries(TUNINGS).map(([value, tuning]) => ({ value, name: tuning.name }));
  return [...own, ...builtIn, { value: ADJUST_ENTRY, name: ADJUST_LABEL }];
}

// Grad eines Tons zum Grundton, 0 bis 11.
export function degreeOf(midi, rootMidi) {
  return (((midi - rootMidi) % 12) + 12) % 12;
}

// Cent eines Grads der Stimmung.
export function degreeCents(tuning, degree) {
  return 1200 * Math.log2(tuning.ratios[degree]);
}

// Stelle des Eintrags, der gleich hoch ist wie der Wert (auf 0,005 Cent), sonst −1. Er wird hervorgehoben.
export function sameIntervalIndex(intervals, cents) {
  return intervals.findIndex((entry) => Math.abs(entry.cents - cents) < 0.005);
}

// Bedienung des Anpassens. `harmonyKeyboard` ist die Harmonieklaviatur, `panel` das Anpass-Feld rechts,
// `list` die Intervall-Liste, `strip` der Streifen rechts daneben mit ✕ und Cent-Feld.
export function setupTuningEditor({ harmonyKeyboard, panel, list, strip }) {
  let editing = false;
  // Schlüssel der Stimmung, die angepasst wird.
  let editingKey = null;
  let selectedDegree = null;

  // Die Häuser schrumpfen beim Anpassen (CSS-Klasse „editing“).
  function markHouses() {
    harmonyKeyboard.rootElement.parentElement.classList.toggle("editing", editing);
  }

  // Beginnt das Anpassen. Eine fest hinterlegte Stimmung wird zuerst als eigene Kopie angelegt; gibt es schon eine
  // eigene mit diesem Namen, wird sie überschrieben.
  function start() {
    const changes = { useTuning: true, harmonyMode: "manual" };
    if (!state.tuningMode.startsWith(CUSTOM_PREFIX)) {
      const copy = adjustedCopy(findTuning(state.tuningMode) ?? TUNINGS.thilo);
      const key = customTuningKey(copy.name);
      changes.customTunings = { ...state.customTunings, [key]: copy };
      changes.tuningMode = key;
    }
    setStates(changes);
    editing = true;
    editingKey = state.tuningMode;
    selectedDegree = null;
    panel.hidden = false;
    markHouses();
  }

  function stop() {
    if (!editing) return;
    closeList();
    editing = false;
    panel.hidden = true;
    markHouses();
  }

  // Tipp auf ein Tonhaus beim Anpassen: wählt dessen Grad und öffnet die Liste, das Grundton-Haus nicht.
  function pressHouse(midi) {
    const degree = degreeOf(midi, state.rootMidi);
    if (degree === 0) return;
    selectedDegree = degree;
    openList();
  }

  panel.querySelector("#tuning-editor-done").addEventListener("click", stop);

  // --- Intervall-Liste ---
  const degreeLabel = strip.querySelector("#interval-degree");
  const centsInput = strip.querySelector("#interval-cents");
  let rows = null;

  function currentTuning() {
    return findTuning(editingKey, state.customTunings);
  }

  // Die Einträge entstehen beim ersten Öffnen. Oben Wert und Cent, darunter klein die Namen.
  function buildRows() {
    rows = INTERVALS.map((entry, index) => {
      const row = document.createElement("div");
      row.className = "interval";
      row.dataset.index = String(index);
      const top = document.createElement("div");
      top.className = "interval-top";
      const value = document.createElement("span");
      value.className = "interval-value";
      value.textContent = entry.value;
      const cents = document.createElement("span");
      cents.className = "interval-cents";
      cents.textContent = formatIntervalCents(entry);
      top.append(value, cents);
      const names = document.createElement("div");
      names.className = "interval-names";
      names.textContent = entry.names.join(" / ");
      row.append(top, names);
      list.appendChild(row);
      return row;
    });
  }

  // Hebt den Eintrag des Werts hervor und schreibt das Cent-Feld.
  function showValue() {
    const cents = degreeCents(currentTuning(), selectedDegree);
    const same = sameIntervalIndex(INTERVALS, cents);
    rows.forEach((row, index) => row.classList.toggle("current", index === same));
    centsInput.value = cents.toFixed(2);
  }

  function openList() {
    if (!rows) buildRows();
    list.hidden = false;
    strip.hidden = false;
    degreeLabel.textContent = `Grad ${selectedDegree}`;
    showValue();
    // Gescrollt zum bisherigen Wert, mittig.
    const tuning = currentTuning();
    const nearest = nearestIntervalIndex(INTERVALS, tuning.values[selectedDegree - 1]);
    const row = rows[Math.max(0, nearest)];
    list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
  }

  function closeList() {
    if (document.activeElement === centsInput) centsInput.blur();
    list.hidden = true;
    strip.hidden = true;
    selectedDegree = null;
  }

  function applyValue(value) {
    const tuning = withDegreeValue(currentTuning(), selectedDegree, value);
    setState("customTunings", { ...state.customTunings, [editingKey]: tuning });
    showValue();
  }

  // Ein Tipp (nicht ein Wischen) auf einen Eintrag übernimmt dessen Wert.
  list.addEventListener("click", event => {
    const row = event.target.closest(".interval");
    if (row && selectedDegree !== null) applyValue(INTERVALS[Number(row.dataset.index)].value);
  });

  // Ein Tipp auf den Streifen schließt die Liste, außer auf das Cent-Feld.
  strip.addEventListener("pointerdown", event => {
    if (event.target === centsInput) return;
    event.preventDefault();
    closeList();
  });

  // Das Cent-Feld übernimmt beim Abschicken (Enter oder Tipp außerhalb), wie der Stimmton; begrenzt auf 0–1200.
  centsInput.addEventListener("change", () => {
    const value = centsInput.value === "" ? null : centsToValue(Number(centsInput.value));
    if (value !== null && selectedDegree !== null) applyValue(value);
    else if (selectedDegree !== null) showValue();
  });
  centsInput.addEventListener("keydown", event => {
    if (event.key === "Enter") centsInput.blur();
  });
  document.addEventListener("pointerdown", event => {
    if (document.activeElement === centsInput && event.target !== centsInput) centsInput.blur();
  }, { capture: true });

  // Eine andere Stimmung oder ausgeschaltetes Tuning beendet das Anpassen.
  onStateChange(["tuningMode", "useTuning"], () => {
    if (editing && (!state.useTuning || state.tuningMode !== editingKey)) stop();
  });

  return { start, stop, pressHouse, isEditing: () => editing };
}
