// Auswahllisten des Browsers: Der gewählte Eintrag trägt vorn einen Punkt (Z3.2).
export const SELECTED_MARK = "● ";

// Text eines Eintrags: gewählt mit Punkt, sonst nur der Name.
export function optionText(name, selected) {
  return selected ? SELECTED_MARK + name : name;
}

// Setzt die Texte aller Einträge neu; `names` ordnet jedem Wert seinen Namen zu.
export function markSelected(select, value, names) {
  for (const option of select.options) {
    option.textContent = optionText(names[option.value] ?? "", option.value === value);
  }
}
