/* ============================================================
   HARMONIEKLAVIATUR (L7)
   ============================================================ */

// Lage der 15 Häuser in Prozent der Breite. Alle Häuser sind eine weiße Taste breit.
// Unten 7 Häuser (die weißen Tasten c bis h), oben 8 Häuser, je eins auf jeder Grenze zwischen
// zwei unteren, die beiden äußeren ragen zur Hälfte über den Rand. Oben sitzen die schwarzen Tasten
// und drei Sonderhäuser: links am Rand, zwischen e und f, rechts am Rand.
// `offset` ist der Abstand in Halbtönen vom untersten Ton, bei Sonderhäusern null.
const LOWER_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const UPPER_SLOTS = ["left", 1, 3, "middle", 6, 8, 10, "right"];

export function houseLayout() {
  const width = 100 / 7;
  const lower = LOWER_OFFSETS.map((offset, index) => ({
    row: "lower", offset, special: null, left: index * width, width
  }));
  const upper = UPPER_SLOTS.map((slot, index) => ({
    row: "upper",
    offset: typeof slot === "number" ? slot : null,
    special: typeof slot === "string" ? slot : null,
    left: (index - 0.5) * width,
    width
  }));
  return [...lower, ...upper];
}

// Was ein Tipp auf die Lücke e–f bewirkt (W7): Bei eingeschaltetem Tuning ist dort „Stimmung aus“ und schaltet
// es aus. Bei ausgeschaltetem Tuning ist die Lücke leer; war das Tuning in dieser Sitzung schon einmal an,
// schaltet der Tipp es wieder ein, und Grundton und Modus sind die gemerkten. Sonst geschieht nichts (null).
export function middleHouseChange(useTuning, tuningWasOn) {
  if (useTuning) return { useTuning: false };
  return tuningWasOn ? { useTuning: true } : null;
}

export class HarmonyKeyboard {
  constructor({ container, startMidi = 60 }) {
    this.houses = houseLayout();
    this.highlightedMidi = null;
    this.highlightPale = false;
    // Ton → Element, nur die 12 Tonhäuser; wird bei `setStart` neu belegt.
    this.keyElements = new Map();
    // Name des Sonderhauses („left“, „middle“, „right“) → Element.
    this.specialElements = new Map();

    this.rootElement = document.createElement("div");
    this.rootElement.className = "keyboard";
    this.rootElement.style.touchAction = "none";
    container.appendChild(this.rootElement);

    this.elements = this.houses.map(house => {
      const element = document.createElement("div");
      element.className = `key house ${house.row === "lower" ? "white" : "black"}`;
      if (house.special) {
        element.classList.add("special");
        element.dataset.special = house.special;
        this.specialElements.set(house.special, element);
      }
      element.style.left = house.left + "%";
      element.style.width = house.width + "%";
      this.rootElement.appendChild(element);
      return element;
    });

    this.setStart(startMidi);
  }

  // Unterster Ton (das untere linke Haus); die übrigen folgen im Halbtonabstand.
  setStart(startMidi) {
    this.startMidi = startMidi;
    this.keyElements.clear();
    this.houses.forEach((house, index) => {
      if (house.offset === null) return;
      const midi = startMidi + house.offset;
      this.elements[index].dataset.midi = String(midi);
      this.keyElements.set(midi, this.elements[index]);
    });
    this.applyHighlight();
  }

  // Markiert ein Tonhaus (null: keins); `pale` markiert es blass statt kräftig.
  highlight(midi, pale = false) {
    this.highlightedMidi = midi;
    this.highlightPale = pale;
    this.applyHighlight();
  }

  applyHighlight() {
    for (const [midi, element] of this.keyElements) {
      const marked = midi === this.highlightedMidi;
      element.classList.toggle("active", marked);
      element.classList.toggle("pale", marked && this.highlightPale);
    }
  }

  // Ruft beim Antippen `onKey(midi)` für ein Tonhaus und `onSpecial(name)` für ein Sonderhaus.
  // Gleiten wechselt das Haus nicht.
  onPress(onKey, onSpecial) {
    this.rootElement.addEventListener("pointerdown", event => {
      const element = event.target.closest(".house");
      if (!element || !this.rootElement.contains(element)) return;
      event.preventDefault();
      if (element.dataset.special !== undefined) onSpecial(element.dataset.special);
      else onKey(Number(element.dataset.midi));
    });
  }
}
