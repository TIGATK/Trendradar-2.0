# Trend-Radar Telematikinfrastruktur

Beobachtet, welche Themen der TI- und Healthcare-IT-Branche gerade Aufmerksamkeit
bekommen, und stellt sie neben bekannte Termine.

- **Fang hier an:** `START-HIER.md` — Schritt-für-Schritt-Checkliste
- **Nachschlagen:** `ANLEITUNG.md`
- **Themen anpassen:** `config/topics.json` (IDs nie ändern)
- **Quellen anpassen:** `config/feeds.json`
- **Termine pflegen:** `config/roadmap.json`

## Aufbau

| Teil | Datei |
|---|---|
| Sammeln, Zuordnen, Fortschreiben | `scripts/collect.mjs` |
| Beispieldaten erzeugen | `scripts/beispieldaten.mjs` |
| Frontend | `public/index.html` |
| Tägliche Automatik | `.github/workflows/collect.yml` |
| Hosting über Cloudflare Pages | `HOSTING-CLOUDFLARE.md`, `public/_headers` |
| Einbettung in Webflow | `HOSTING-WEBFLOW.md`, `webflow-embed.html` |
| Signale erklärt | `SIGNALE.md` |
| Hosting über GitHub Pages | `.github/workflows/pages.yml` |
| Hosting über Netlify | `netlify.toml` |

Keine Abhängigkeiten, kein Build. Node 20 für das Skript, reines HTML/SVG/JS im
Frontend.

## Datenformat

`public/data/snapshots.json`, Schema 3.

Jedes Thema trägt ein Objekt `signals` mit den Schlüsseln `aktivitaet` und
`interesse`. Jedes Signal hat denselben Aufbau: datumsindizierte
`counts` als Grundlage der Fortschreibung, `series`, geglättete `smooth`, sowie
`total` / `last7` / `prev7` / `momentum` / `hat`.

Die Signale werden bewusst getrennt geführt und nie addiert — siehe `SIGNALE.md`.
Welche davon Daten haben, steht auf oberster Ebene in `signale[]`; das Frontend
baut seinen Umschalter daraus.
