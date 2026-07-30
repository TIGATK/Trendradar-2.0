# Trend-Radar Telematikinfrastruktur — Einrichtung

Alles läuft über den Browser. Kein Terminal, keine CLI.

---

## Was das Tool tut

Einmal täglich sammelt eine GitHub-Action Beiträge aus Fachpresse und Pressestellen,
ordnet sie einer festen Themenliste zu und schreibt das Ergebnis in
`public/data/snapshots.json`. Der Commit löst den Deploy aus, das Frontend zeigt die
neuen Zahlen.

Wichtig zum Verständnis: Der Snapshot wird **fortgeschrieben**, nicht neu erzeugt.
Tageswerte, die älter als drei Tage sind, bleiben stehen. Dadurch entsteht über Wochen
eine echte Historie, statt einer Kurve, die nur abbildet, wie weit die RSS-Feeds
zurückreichen.

---

## Schritt 1 — Dateien ins Repository laden

Über `Add file` → `Upload files` im GitHub-Web-Interface. Struktur beibehalten:

```
config/topics.json
config/feeds.json
config/roadmap.json
scripts/collect.mjs
scripts/beispieldaten.mjs
public/index.html
public/data/snapshots.json
netlify.toml
package.json
```

Die Workflow-Dateien gehen nicht per Upload. Dafür den Reiter `Actions` öffnen,
`set up a workflow yourself` wählen, Inhalt von `collect.yml` einfügen, als
`collect.yml` speichern. Für GitHub Pages dasselbe mit `pages.yml`.

## Schritt 2 — API-Schlüssel hinterlegen

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

| Name | Wert |
|---|---|
| `ANTHROPIC_API_KEY` | Der Schlüssel aus der Anthropic-Konsole |

## Schritt 3 — Erst testen, dann scharf schalten

`Actions` → `Trend-Radar sammeln` → `Run workflow` → **`dry_run` ankreuzen** → starten.

Der Trockenlauf ruft alle Feeds ab, schreibt nichts und kostet keinen API-Aufruf.
Das Ergebnis steht in der Job-Zusammenfassung: welche Quelle liefert, welche nicht,
und mit welchem Fehler.

**Damit die Feedliste bereinigen.** Die URLs in `config/feeds.json` sind ungeprüfte
Startwerte. Erwartungsgemäß liefert ein Teil davon nicht. Typische Fehlerbilder:

| Fehler | Bedeutung | Vorgehen |
|---|---|---|
| `HTTP 404` | Feed-Adresse existiert nicht | Richtige URL auf der Seite suchen, meist im Fußbereich |
| `HTTP 403` | Server blockt automatisierte Zugriffe | Meist nicht lösbar, Quelle entfernen |
| `keine lesbaren Eintraege` | Antwort war HTML statt RSS | URL zeigt auf eine normale Seite, nicht auf den Feed |
| `0 Beiträge` bei Status ok | Feed liefert, aber der Stichwortfilter greift zu hart | `"filter": false` setzen oder Stichwort ergänzen |

Trockenlauf wiederholen, bis genug Quellen stehen. Acht funktionierende Feeds sind
ein brauchbarer Anfang.

## Schritt 4 — Erster echter Lauf

`Run workflow` ohne `dry_run`. Danach zeigt das Radar echte Daten.

Schlägt die Plausibilitätsprüfung an (unter zwei Quellen, unter fünf Beiträge, kein
Thema mit Treffern), bricht der Lauf ab und schreibt **nichts**. Das ist beabsichtigt:
ein alter, korrekter Snapshot ist besser als ein neuer, leerer.

## Schritt 5 — Roadmap pflegen

`config/roadmap.json` ist der einzige Teil, der von Hand kommt, und der einzige, der
nach vorn schaut. Hier kommen bekannte Termine rein: gematik-Releases, gesetzliche
Stichtage, Migrationsfristen. Das Frontend zeichnet sie rechts der Heute-Linie ein.

Einmal im Monat durchgehen. Jeder Eintrag mit `"geprueft": null` erzeugt einen
Warnhinweis im Frontend — das ist Absicht, damit keine veralteten Termine unbemerkt
stehen bleiben.

---

## Stellschrauben

Alles über `Settings` → `Secrets and variables` → `Actions` → Reiter `Variables`:

| Variable | Standard | Wirkung |
|---|---|---|
| `CLAUDE_MODEL` | `claude-sonnet-5` | Modell für die Einordnungstexte je Thema |
| `CLAUDE_MODEL_FAST` | `claude-haiku-4-5-20251001` | Modell für die Zuordnung der Beiträge |

Über `Run workflow` direkt einstellbar: `days` (Fensterbreite) und `dry_run`.

Weitere Umgebungsvariablen im Skript: `RECALC_DAYS` (Standard 3), `MAX_PER_SOURCE`
(60), `MIN_SOURCES` (2), `MIN_ITEMS` (5), `NO_LLM` (kompletter Lauf ohne Modell,
Zuordnung dann nur per Stichwort — nützlich zum Testen).

---

## Kosten

Pro Lauf gehen die Titel und Kurztexte von 100 bis 300 Beiträgen in Vierziger-Blöcken
an das schnelle Modell, dazu ein Aufruf für die Einordnungstexte. Das bewegt sich im
Bereich weniger Cent pro Tag. GitHub Actions und Netlify bleiben im kostenlosen Rahmen.

---

## Wenn etwas nicht stimmt

**Kurven fangen bei null an.** Normal. Die Historie baut sich erst auf. Nach zwei
Wochen täglicher Läufe wird die Darstellung aussagekräftig.

**Ein Thema bekommt nichts ab.** Prüfen, ob die Feeds das Thema überhaupt abdecken.
Sonst `hints` in `config/topics.json` schärfen.

**"Sonstiges" ist der größte Balken.** Zeichen dafür, dass die Taxonomie eine Lücke
hat. Die Schlagzeilen unter "Sonstiges" durchsehen — wiederkehrende Muster verdienen
ein eigenes Thema.

**Das Radar zeigt alte Daten.** Wenn der Snapshot älter als 48 Stunden ist, blendet
das Frontend eine Warnung ein. Ursache steht im Actions-Reiter.

**Netlify deployt nicht nach dem Commit.** In Netlify einen Build-Hook anlegen
(`Site settings` → `Build & deploy` → `Build hooks`) und die URL als Secret
`NETLIFY_BUILD_HOOK` hinterlegen. Der Workflow ruft ihn dann auf.
