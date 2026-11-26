// Stimmung anpassen (Z3.4): Eine fest hinterlegte Stimmung wird als Kopie „Name (angepasst)“ angepasst, eine eigene
// direkt. Ein Tipp auf ein Haus der Harmonieklaviatur wählt dessen Grad zum Grundton; Grad 0 ist nicht änderbar.
// Die Kopie gilt bis zum Neuladen. Die Intervall-Liste öffnet sich mit dem Tipp auf ein Haus; ein Eintrag gilt
// sofort, ohne eigenen Klang, und die Liste bleibt offen. Sustain, Release und Hauptklaviatur bleiben nutzbar.

import { state, setState, setStates, onStateChange } from "./state.js";
import {
  TUNINGS, CUSTOM_PREFIX, findTuning, customTuningKey, adjustedCopy, withDegreeValue, centsToValue, formatCents
} from "./tuning.js";
import { INTERVALS, nearestIntervalIndex } from "./intervals.js";

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

// Stelle des Eintrags mit genau diesem Wert, sonst −1. Er wird hervorgehoben; nach einer freien Eingabe wie
// `386.31` also keiner. Cent-Werte zählen als Zahl (`300.0` ist `300.00`), Verhältnisse als Text.
export function currentIntervalIndex(intervals, value) {
  const isCents = text => text.includes(".");
  return intervals.findIndex((entry) =>
    isCents(value) ? isCents(entry.value) && Number(entry.value) === Number(value) : entry.value === value);
}

// Abweichung eines Eintrags vom gleichstufigen Ton des Grads in Cent, mit dem Oktavverhältnis der Stimmung.
export function intervalDeviation(entry, degree, octaveRatio) {
  return entry.cents - degree * 1200 * Math.log2(octaveRatio) / 12;
}

// Unterscheidet einen echten Tipp auf die Liste von einem durchgereichten: Der Finger, der ein Haus antippt, öffnet
// die Liste schon beim Aufsetzen und lässt dann über einem Eintrag los. Ein Tipp zählt nur, wenn er auf der Liste
// aufgesetzt hat (`down`) und seit dem Öffnen (`reset`) noch nicht gezählt wurde.
export function createTapGuard() {
  let armed = false;
  return {
    reset() { armed = false; },
    down() { armed = true; },
    isTap() {
      const tap = armed;
      armed = false;
      return tap;
    }
  };
}

// Bedienung des Anpassens. `harmonyKeyboard` ist die Harmonieklaviatur, `panel` das Anpass-Feld rechts,
// `list` die Intervall-Liste, `strip` der Streifen rechts daneben mit ✓, ✕ und Cent-Feld.
export function setupTuningEditor({ harmonyKeyboard, panel, list, strip }) {
  let editing = false;
  // Schlüssel der Stimmung, die angepasst wird.
  let editingKey = null;
  let selectedDegree = null;
  // Wert des Grads beim Öffnen der Liste; ✕ setzt ihn zurück.
  let valueBeforeList = null;

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
    if (!list.hidden) closeList();
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
  const tapGuard = createTapGuard();

  function currentTuning() {
    return findTuning(editingKey, state.customTunings);
  }

  // Die Einträge entstehen beim ersten Öffnen. Oben die Namen groß und rechts die Abweichung vom gleichstufigen Ton
  // des Grads, darunter klein Wert und Cent.
  function buildRows() {
    rows = INTERVALS.map((entry, index) => {
      const row = document.createElement("div");
      row.className = "interval";
      row.dataset.index = String(index);
      const top = document.createElement("div");
      top.className = "interval-top";
      const names = document.createElement("div");
      names.className = "interval-names";
      const namesText = document.createElement("span");
      namesText.textContent = entry.names.join(" / ");
      names.appendChild(namesText);
      const deviation = document.createElement("span");
      deviation.className = "interval-deviation";
      top.append(names, deviation);
      const detail = document.createElement("div");
      detail.className = "interval-detail";
      detail.textContent = `${entry.value} · ${entry.cents.toFixed(2)} ct`;
      row.append(top, detail);
      list.appendChild(row);
      return row;
    });
  }

  // Abweichungen zum gleichstufigen Ton des gewählten Grads.
  function showDeviations() {
    const octave = currentTuning().ratios[12];
    rows.forEach((row, index) => {
      row.querySelector(".interval-deviation").textContent =
        formatCents(intervalDeviation(INTERVALS[index], selectedDegree, octave), 2);
    });
  }

  // Laufschrift im gewählten Eintrag: Der umbrochene Name läuft nach oben und zurück, nur wenn er nicht in eine
  // Zeile passt.
  function startTicker(row) {
    const names = row.querySelector(".interval-names");
    names.classList.add("ticker");
    const distance = names.firstChild.offsetHeight - names.clientHeight;
    if (distance <= 0) return;
    names.style.setProperty("--ticker-distance", `-${distance}px`);
    names.style.setProperty("--ticker-duration", `${Math.max(3, distance / 15)}s`);
    names.classList.add("ticker-running");
  }

  function stopTicker(row) {
    row.querySelector(".interval-names").classList.remove("ticker", "ticker-running");
  }

  // Hebt den Eintrag mit genau dem Wert des Grads hervor und schreibt das Cent-Feld.
  function showValue() {
    const tuning = currentTuning();
    const current = currentIntervalIndex(INTERVALS, tuning.values[selectedDegree - 1]);
    rows.forEach((row, index) => {
      const wasCurrent = row.classList.contains("current");
      row.classList.toggle("current", index === current);
      if (wasCurrent && index !== current) stopTicker(row);
      if (!wasCurrent && index === current) startTicker(row);
    });
    centsInput.value = degreeCents(tuning, selectedDegree).toFixed(2);
  }

  function openList() {
    if (!rows) buildRows();
    list.hidden = false;
    strip.hidden = false;
    degreeLabel.textContent = `Grad ${selectedDegree}`;
    const tuning = currentTuning();
    valueBeforeList = tuning.values[selectedDegree - 1];
    tapGuard.reset();
    showDeviations();
    showValue();
    // Gescrollt zum bisherigen Wert, mittig.
    const nearest = nearestIntervalIndex(INTERVALS, valueBeforeList);
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

  // Ein Tipp (nicht ein Wischen) auf einen Eintrag übernimmt dessen Wert, aber nur, wenn er auf der Liste begonnen
  // hat (siehe `createTapGuard`).
  list.addEventListener("pointerdown", () => tapGuard.down());
  list.addEventListener("click", event => {
    const row = event.target.closest(".interval");
    if (tapGuard.isTap() && row && selectedDegree !== null) applyValue(INTERVALS[Number(row.dataset.index)].value);
  });

  // ✓ übernimmt die Änderungen, ✕ setzt den Grad auf den Wert beim Öffnen zurück; beide schließen die Liste.
  // Ein Tipp anderswo auf den Streifen bewirkt nichts.
  strip.addEventListener("pointerdown", event => {
    if (event.target !== centsInput) event.preventDefault();
  });
  strip.querySelector("#interval-accept").addEventListener("click", () => {
    if (document.activeElement === centsInput) centsInput.blur();
    closeList();
  });
  strip.querySelector("#interval-close").addEventListener("click", () => {
    if (document.activeElement === centsInput) centsInput.blur();
    if (selectedDegree !== null) applyValue(valueBeforeList);
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
