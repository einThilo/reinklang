// Eine Folge von Schritten im festen Abstand, z. B. die Oktave als 12 sichtbare Halbtonschritte (Z19.1).
// `step(direction)` führt einen Schritt aus und gibt `false` zurück, wenn es nicht weitergeht (Grenze);
// dann endet der Lauf. Die Zeitgeber lassen sich für Tests austauschen.
export function createStepRun({ step, intervalMs, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let direction = 0;
  let remaining = 0;
  let timer = null;

  function stop() {
    clearTimer(timer);
    timer = null;
    remaining = 0;
  }

  function tick() {
    timer = null;
    remaining--;
    if (!step(direction)) {
      stop();
      return;
    }
    if (remaining > 0) timer = setTimer(tick, intervalMs);
  }

  // Läuft schon ein Lauf in dieselbe Richtung, kommen die Schritte hinzu (gerechnet ab dem Ziel).
  // Sonst bricht ein laufender ab, und der neue beginnt mit einem sofortigen Schritt.
  function start(newDirection, count) {
    if (remaining > 0 && newDirection === direction) {
      remaining += count;
      return;
    }
    stop();
    direction = newDirection;
    remaining = count;
    tick();
  }

  return { start, stop };
}
