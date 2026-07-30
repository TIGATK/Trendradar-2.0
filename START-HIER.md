# Start hier

Ein Weg, von oben nach unten. Keine Entscheidungen unterwegs.

---

## Was ist das hier überhaupt?

Ein Werkzeug, das jeden Morgen automatisch Nachrichten aus der
Telematikinfrastruktur-Branche einsammelt und daraus eine Grafik baut: Welches
Thema wird gerade oft erwähnt, wer treibt es, welche Schlagzeilen gehören dazu.

Dazu eine zweite Kurve: Wonach suchen Leute im Netz. Wo die beiden Kurven
auseinanderlaufen, findet ihr Themen, über die viel geredet wird, ohne dass es
jemanden interessiert — und umgekehrt Themen, die interessieren, über die aber
niemand schreibt. Das Zweite sind eure Content-Lücken.

## Wie es funktioniert

Vier Schritte, die jeden Tag von allein ablaufen:

```
1. Ein Computer bei GitHub wacht um 6 Uhr auf
2. Er holt sich Nachrichten von rund 15 Webseiten
3. Er lässt Claude sortieren: welche Nachricht gehört zu welchem Thema
4. Er speichert das Ergebnis in einer Datei — die Webseite zeigt sie an
```

Du musst nichts davon anstoßen. Du musst es einmal einrichten.

## Vokabeln

Fünf Wörter, die dauernd vorkommen:

| Wort | Was es ist |
|---|---|
| **Repository** (kurz: Repo) | Der Ordner bei GitHub, in dem alle Dateien liegen |
| **Commit** | Speichern bei GitHub. Jede Änderung wird protokolliert |
| **Action** | Der Automat, der jeden Morgen läuft |
| **Feed** | Eine Adresse, unter der eine Webseite ihre Nachrichten maschinenlesbar anbietet |
| **Snapshot** | Die Ergebnisdatei. Wird jeden Tag ergänzt, nicht überschrieben |

## Was du brauchst

- Zugang zum GitHub-Repository
- Den API-Schlüssel von Anthropic (liegt vielleicht schon drin, prüfen wir)
- Zugang zu Webflow

---

# Tag 1 — Einrichten

⏱ etwa eine Stunde. Du kannst nach Schritt 10 aufhören und morgen weitermachen.

## Schritt 1 — ZIP entpacken

Entpack `trend-radar.zip` irgendwo auf deinem Rechner. Öffne den Ordner. Du
siehst darin Ordner wie `config`, `public`, `scripts` und ein paar
Textdateien.

**✅ Geschafft, wenn:** Du den Ordnerinhalt vor dir hast.

## Schritt 2 — Repository öffentlich stellen

Öffne das Repository auf GitHub. Klick auf `Settings`. Scroll ganz nach unten
bis `Danger Zone`. Dort `Change visibility` → `Make public`.

*Warum:* GitHub stellt Webseiten nur für öffentliche Repos kostenlos ins Netz.
In den Daten stehen ausschließlich Pressemeldungen, die ohnehin öffentlich sind.

Wenn dir das nicht geheuer ist, überspring diesen Schritt und lies ganz unten
„Falls du das Repo privat lassen willst".

**✅ Geschafft, wenn:** Oben neben dem Repo-Namen steht `Public`.

## Schritt 3 — Dateien hochladen

Im Repository oben auf `Add file` → `Upload files`.

Jetzt aufpassen: Markier im entpackten Ordner **alles auf einmal** (Strg+A) und
zieh es in das graue Feld im Browser. Nicht den Ordner `trend-radar` selbst
ziehen — nur seinen Inhalt.

Warte, bis alle Dateien im Browser aufgelistet sind. Dann unten auf
`Commit changes`.

**✅ Geschafft, wenn:** In der Dateiliste des Repos stehen oben die Ordner
`config`, `public` und `scripts`.

## Schritt 4 — Den Automaten einrichten

Klick oben im Repo auf den Reiter `Actions`.

**Steht dort schon „Trend-Radar sammeln"?**
Klick drauf, dann rechts auf das Stiftsymbol. Markier den gesamten Text (Strg+A),
lösch ihn. Öffne aus dem entpackten Ordner die Datei
`.github/workflows/collect.yml` in einem Texteditor, kopier alles, füg es ein.
`Commit changes`.

**Steht dort nichts?**
`New workflow` → ganz unten `set up a workflow yourself`. Alles im Editor
löschen, Inhalt von `collect.yml` einfügen. Oben den Dateinamen in
`collect.yml` ändern. `Commit changes`.

Das Gleiche noch einmal mit der Datei `pages.yml`.

**✅ Geschafft, wenn:** Unter `Actions` stehen links zwei Einträge.

## Schritt 5 — Schlüssel hinterlegen

`Settings` → links `Secrets and variables` → `Actions`.

Schau in der Liste, ob `ANTHROPIC_API_KEY` schon dasteht.

Wenn nicht: `New repository secret`. Name exakt `ANTHROPIC_API_KEY`, als Wert
den Schlüssel aus der Anthropic-Konsole einfügen. `Add secret`.

**✅ Geschafft, wenn:** `ANTHROPIC_API_KEY` steht in der Liste.

## Schritt 6 — Kontaktadresse hinterlegen

Auf derselben Seite oben auf den Reiter `Variables`.
`New repository variable`. Name: `WIKIMEDIA_UA`. Als Wert:

```
TrendRadar/2.1 (https://www.telekonnekt.de; deine-mail@telekonnekt.de)
```

*Warum:* Wikipedia liefert uns Daten und möchte wissen, wer fragt.

**✅ Geschafft, wenn:** `WIKIMEDIA_UA` steht unter `Variables`.

---

## Schritt 7 — Probelauf starten

`Actions` → links `Trend-Radar sammeln` → rechts `Run workflow`.

Ein kleines Fenster klappt auf. **Setz den Haken bei `dry_run`.** Dann auf den
grünen Knopf.

Der Probelauf schaut nur nach, ob die Nachrichtenquellen erreichbar sind. Er
speichert nichts und kostet nichts. Du kannst ihn so oft wiederholen, wie du
willst.

**✅ Geschafft, wenn:** Ein neuer Eintrag mit gelbem Punkt erscheint.

## Schritt 8 — Ergebnis anschauen

Warte zwei Minuten. Lade die Seite neu. Klick auf den Lauf. Scroll runter zu
`Summary`. Dort steht eine Liste:

```
OK    18  gematik Newsroom
FEHL   0  KBV Nachrichten  -> HTTP 404
OK    24  aerzteblatt Politik
```

`OK` heißt: Die Quelle liefert. `FEHL` heißt: Sie liefert nicht.

**Dass etwa die Hälfte fehlschlägt, ist normal.** Die Adressen sind Vorschläge,
die noch nie jemand geprüft hat. Genau das machst du jetzt.

## Schritt 9 — Kaputte Quellen entfernen

Im Repository die Datei `config/feeds.json` öffnen, rechts auf das Stiftsymbol.

Du siehst eine Liste von Zeilen, die so aussehen:

```json
{ "name": "KBV Nachrichten", "url": "https://www.kbv.de/rss/kbv_nachrichten.xml", "filter": true },
```

Für jede Quelle, die `FEHL` gemeldet hat: **Lösch die ganze Zeile.**

Zwei Regeln dabei:
- Die Zeile muss komplett weg, von `{` bis `},`
- Bei der allerletzten Zeile in der Liste darf **kein Komma** am Ende stehen

Unten `Commit changes`.

*Optional, wenn du Lust hast:* Bei einer fehlenden Quelle kannst du auf der
Webseite nach der richtigen Feed-Adresse suchen, statt sie zu löschen. Meist
steht sie im Fußbereich. Muss aber nicht sein — acht funktionierende Quellen
reichen für den Anfang völlig.

**✅ Geschafft, wenn:** Nur noch Zeilen übrig sind, die `OK` gemeldet haben.

## Schritt 10 — Probelauf wiederholen

Zurück zu Schritt 7. Wiederhol das so lange, bis mindestens acht Quellen `OK`
melden und Zahlen größer als null zeigen.

Wenn plötzlich **alles** fehlschlägt und der Lauf abbricht, ist meist ein Komma
zu viel oder zu wenig in `feeds.json`. Zurück zu Schritt 9 und die Datei
anschauen.

**✅ Geschafft, wenn:** Mindestens acht Zeilen mit `OK`.

*Hier kannst du Pause machen.*

---

## Schritt 11 — Echter Lauf

`Actions` → `Run workflow` → **diesmal den Haken bei `dry_run` NICHT setzen** →
grüner Knopf.

Jetzt arbeitet Claude mit und sortiert die Nachrichten. Das kostet ein paar Cent.

**✅ Geschafft, wenn:** Nach ein paar Minuten hat der Lauf einen grünen Haken,
und in der Dateiliste des Repos steht ganz oben ein neuer Eintrag namens
„Snapshot 2026-...".

## Schritt 12 — Erwartung dämpfen

Die Kurven sehen jetzt dünn und langweilig aus. **Das ist richtig so.**

Nachrichtenquellen geben nur ihre letzten paar Meldungen heraus, nicht ihr
Archiv. Die Historie muss sich Tag für Tag aufbauen. Nach etwa zwei Wochen
sieht man etwas. Vorher nicht urteilen.

---

# Tag 2 — Online stellen

⏱ etwa 30 Minuten

## Schritt 13 — Webseite einschalten

`Settings` → links in der Spalte `Pages` → bei `Source` auswählen:
`GitHub Actions`.

Warte fünf Minuten, lade neu. Oben erscheint eine Adresse wie
`https://name.github.io/repo/`.

Ruf sie auf. Das Radar sollte da sein.

**Schreib dir diese Adresse auf.** Du brauchst sie in Schritt 16.

**✅ Geschafft, wenn:** Die Adresse zeigt das Radar.

## Schritt 14 — Seite in Webflow anlegen

In Webflow im Designer links auf das Seiten-Symbol, dann auf `+`.

- Name: `Trend-Radar`
- Slug: `trend-radar`

**✅ Geschafft, wenn:** Die leere Seite existiert.

## Schritt 15 — Seite abschließen

Zahnrad neben dem Seitennamen anklicken, dann zwei Dinge:

**Zugriff beschränken.** Such den Abschnitt für Zugriffsrechte — je nach
Webflow-Version heißt er `Access` oder `Restrict access`. Wähl dort die
Nutzergruppe aus, die reindarf.

Findest du den Abschnitt nicht, schau unter `Site settings` → `Users`, ob die
Funktion eingeschaltet ist.

**Aus Google raushalten.** Im Abschnitt `SEO` den Schalter `noindex`
einschalten und die Seite aus der Sitemap ausschließen.

**✅ Geschafft, wenn:** Beides gesetzt ist.

## Schritt 16 — Radar einbauen

Zieh aus dem Elemente-Menü ein `Code Embed` auf die Seite.

Öffne aus dem entpackten Ordner die Datei `webflow-embed.html` in einem
Texteditor. Kopier alles. Füg es in das Code-Embed ein.

Jetzt **eine einzige Zeile ändern.** Such nach:

```
src="https://TELEKONNEKT.github.io/trend-radar/"
```

Ersetz die Adresse durch die aus Schritt 13. Der Rest bleibt, wie er ist.

Speichern, dann oben rechts `Publish`.

**✅ Geschafft, wenn:** Die Seite ist veröffentlicht.

## Schritt 17 — Nachsehen, ob es klappt

Öffne ein privates Browserfenster (Strg+Shift+N). Ruf die Seite auf.

Es sollte eine Anmeldung verlangt werden. Nach dem Einloggen erscheint das Radar.

**✅ Geschafft, wenn:** Genau das passiert.

## Schritt 18 — Netlify abklemmen

Wichtig, sonst läuft das Radar unter zwei Adressen — und die alte Netlify-Adresse
ist die **ungeschützte**.

In Netlify: Site öffnen → `Site configuration` → `Build & deploy` → Verbindung
zum Repository trennen. Oder die Site gleich löschen.

**✅ Geschafft, wenn:** Netlify hängt nicht mehr am Repo.

---

# Fertig

Ab jetzt läuft es jeden Morgen um 6 Uhr von allein.

## Was du später noch machen könntest

**Diese Woche:** In `config/roadmap.json` bekannte Termine eintragen —
gematik-Releases, Fristen, Messen. Da steht bisher nur ein Platzhalter. Eure
Seite `/gesundheitsmessen` hat den Messekalender schon.

**In zwei Wochen:** Zum ersten Mal wirklich draufschauen. Wenn „Sonstiges" der
größte Balken ist, fehlt der Themenliste eine Kategorie.

**Wenn dich etwas stört:** Sag Bescheid. Meldungen wie „die Farben sind
scheußlich" oder „ich hätte gern eine Wochenmail statt einer Webseite" sind
völlig legitim.

---

# Wenn etwas rot ist

Fast immer steht die Antwort im Reiter `Actions`: roten Lauf anklicken, unter
`Summary` nachlesen.

| Was du siehst | Was los ist |
|---|---|
| „Snapshot nicht plausibel" | Zu wenige Quellen liefern. Zurück zu Schritt 9. Der Automat bricht absichtlich ab, statt eine leere Datei zu speichern. |
| „ANTHROPIC_API_KEY fehlt" | Schritt 5 wurde übersprungen oder der Name ist falsch geschrieben. |
| Der Lauf bricht sofort ab | Meist ein Komma zu viel oder zu wenig in `feeds.json`. |
| Radar zeigt „Beispieldaten" | Schritt 11 hat noch nicht geklappt. |
| Radar zeigt alte Daten | Der Automat läuft nicht mehr. Unter `Actions` nachsehen. |

Kommst du nicht weiter: Schick mir die Ausgabe aus `Summary`, dann schauen wir
gemeinsam drauf.

---

## Falls du das Repo privat lassen willst

Dann funktioniert Schritt 13 nicht, weil GitHub Pages für private Repos einen
bezahlten Plan verlangt. Stattdessen: Cloudflare Pages, kostenlos auch für
private Repos. Die Schritte stehen in `HOSTING-CLOUDFLARE.md`. Der Rest der
Liste bleibt gleich, nur die Adresse in Schritt 16 kommt dann von Cloudflare.
