# Am Code arbeiten

Nur nötig, wenn du den Code ändern willst – zum Spielen reicht der Link in der [README](README.md).

## Starten

Reines HTML, CSS und JavaScript ohne Bauschritt und ohne Abhängigkeiten. Die eigene Seite
muss nur über einen Webserver geöffnet werden, zum Beispiel im Projektordner:

```sh
python3 -m http.server 8000
```

Dann `http://localhost:8000/` im Browser öffnen.

## Tests

Die Tests prüfen die Logik (Stimmungen, Pedal, Grundton-Automatik usw.) 
und brauchen [Node.js](https://nodejs.org/):

```sh
npm test
```

## Layout-Varianten

Mit `?layout=<name>` in der Adresse lassen sich andere Anordnungen wählen (Liste in `js/main.js`,
Regeln in `css/style.css`).
