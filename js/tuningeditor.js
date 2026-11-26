// Stimmung anpassen (Z3.4): Eine fest hinterlegte Stimmung wird als Kopie „Name (angepasst)“ angepasst, eine eigene
// direkt. Ein Tipp auf ein Haus der Harmonieklaviatur wählt dessen Grad zum Grundton; Grad 0 ist nicht änderbar.
// Die Kopie gilt bis zum Neuladen.

import { state, setStates, onStateChange } from "./state.js";
import { TUNINGS, CUSTOM_PREFIX, findTuning, customTuningKey, adjustedCopy } from "./tuning.js";

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

// Bedienung des Anpassens. `harmonyKeyboard` ist die Harmonieklaviatur, `panel` das Anpass-Feld rechts.
export function setupTuningEditor({ harmonyKeyboard, panel }) {
  let editing = false;
  // Schlüssel der Stimmung, die angepasst wird.
  let editingKey = null;
  let selectedDegree = null;

  function markHouses() {
    harmonyKeyboard.rootElement.parentElement.classList.toggle("editing", editing);
    for (const [midi, element] of harmonyKeyboard.keyElements) {
      element.classList.toggle("edit-selected", editing && degreeOf(midi, state.rootMidi) === selectedDegree);
    }
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
    editing = false;
    selectedDegree = null;
    panel.hidden = true;
    markHouses();
  }

  // Tipp auf ein Tonhaus beim Anpassen: wählt dessen Grad, das Grundton-Haus nicht.
  function pressHouse(midi) {
    const degree = degreeOf(midi, state.rootMidi);
    if (degree === 0) return;
    selectedDegree = degree;
    markHouses();
  }

  panel.querySelector("#tuning-editor-done").addEventListener("click", stop);

  // Eine andere Stimmung oder ausgeschaltetes Tuning beendet das Anpassen.
  onStateChange(["tuningMode", "useTuning"], () => {
    if (editing && (!state.useTuning || state.tuningMode !== editingKey)) stop();
  });

  return { start, stop, pressHouse, isEditing: () => editing };
}
