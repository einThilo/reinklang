// Prototyp S1.1 (?diagnose=1): zeigt oben links, was auf dem Gerät geschieht, wenn keine Konsole
// erreichbar ist (iOS, Android-Tablet). Bewusst kein Modul und in alter Schreibweise, damit das Feld
// auch erscheint, wenn die Module nicht laden. Ohne den Zusatz in der Adresse tut dieses Skript nichts.
(function () {
  if (!/[?&]diagnose=1(&|$)/.test(location.search)) return;

  var errors = [];
  var reports = {};
  var pointerCount = 0;
  var box = null;

  function addError(text) {
    if (errors.length < 8) errors.push(text);
    render();
  }

  function count(selector) {
    return document.querySelectorAll ? document.querySelectorAll(selector).length : "?";
  }

  function lines() {
    var result = [
      "Browser: " + String(navigator.userAgent).slice(0, 90),
      "Adresse: " + location.protocol,
      "main.js: " + (reports["main.js"] || "nicht gestartet"),
      "Tasten: " + count("#keyboard .key") + ", Listeneinträge: " + count("option"),
      "Finger: " + pointerCount
    ];
    for (var name in reports) {
      if (name === "main.js") continue;
      var value = reports[name];
      result.push(name + ": " + (typeof value === "function" ? value() : value));
    }
    result.push(errors.length ? "Fehler:" : "Fehler: keine");
    return result.concat(errors);
  }

  function render() {
    if (box) box.textContent = lines().join("\n");
  }

  // `value` ist ein Text oder eine Funktion, die bei jeder Anzeige den aktuellen Text liefert.
  window.reinklangDiagnose = {
    report: function (name, value) {
      reports[name] = value;
      render();
    },
    lines: lines
  };

  window.addEventListener("error", function (event) {
    if (event.message) {
      addError(event.message + " (" + String(event.filename || "").split("/").pop() + ":" + event.lineno + ")");
    } else if (event.target && (event.target.src || event.target.href)) {
      addError("Laden fehlgeschlagen: " + (event.target.src || event.target.href));
    }
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    addError("Abgelehnt: " + (event.reason && event.reason.message ? event.reason.message : event.reason));
  });

  function changePointers(delta) {
    return function () {
      pointerCount = Math.max(0, pointerCount + delta);
      render();
    };
  }
  document.addEventListener("pointerdown", changePointers(1), true);
  document.addEventListener("pointerup", changePointers(-1), true);
  document.addEventListener("pointercancel", changePointers(-1), true);

  document.addEventListener("DOMContentLoaded", function () {
    box = document.createElement("pre");
    box.id = "diagnose";
    box.style.cssText = "position:fixed;left:0;top:0;z-index:200;margin:0;padding:4px;max-width:70%;" +
      "background:rgba(0,0,0,0.75);color:#0f0;font:10px/1.2 monospace;white-space:pre-wrap;pointer-events:none;";
    document.body.appendChild(box);
    render();
    setInterval(render, 500);
  });
})();
