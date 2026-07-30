# Die zwei Signale des Radars

Das Radar führt zwei Signale getrennt. Sie werden nie zu einer Zahl addiert,
weil sie unterschiedliche Fragen beantworten.

| Signal | Quelle | Frage | Einheit |
|---|---|---|---|
| **Branchenaktivität** | Fachpresse, Pressestellen, Bluesky, Mastodon | Worüber wird geschrieben? | Beiträge |
| **Öffentliches Interesse** | Wikipedia-Abrufzahlen | Wonach wird gesucht? | Abrufe |

Beide messen das Thema, nicht einen Anbieter. Das Radar sagt nichts darüber aus,
wie Telekonnekt zu einem Thema dasteht — das ist eine SEO-Frage und gehört in ein
anderes Werkzeug.

---

## Wie man daraus Contentlücken liest

Die Aussage entsteht aus dem Vergleich, nicht aus einer einzelnen Kurve.

**Viel Aktivität, wenig Interesse.** Die Branche redet mit sich selbst. Ein Thema,
über das viel geschrieben wird, ohne dass jemand danach sucht. Kampagnen darauf
laufen ins Leere.

**Viel Interesse, wenig Aktivität.** Informationsbedarf, den niemand bedient. Die
klassische Contentlücke.

**Interesse steigt, Aktivität noch flach.** Das interessanteste Muster: ein Thema
im Kommen, bevor die Fachpresse aufspringt. Wer hier zuerst publiziert, besetzt es.

**Beides flach, aber ein Termin steht an.** Dafür ist der Roadmap-Layer da. Ein
gematik-Release in acht Wochen ist heute kein Thema — der Zeitpunkt, ab dem
Content dazu sinnvoll wird, steht aber fest.

---

## Quelle: Wikipedia-Abrufzahlen

Offene API der Wikimedia Foundation. Keine Anmeldung, keine Kosten, keine
Einrichtung — läuft ab dem ersten Lauf.

**Was sie liefert:** Tägliche Abrufe deutschsprachiger Artikel, etwa
„Elektronische Patientenakte" oder „Telematikinfrastruktur". Ein grober, aber
ehrlicher Indikator für öffentliches Interesse, unabhängig davon, welche Seite
zu einem Thema rankt.

**Die Einschränkung:** Nur für Themen, zu denen es einen Artikel gibt. Für
„TI-Gateway" oder „GeDIG" existiert keiner — diese Themen haben deshalb nur das
Aktivitätssignal. Das ist in Ordnung und im Frontend sichtbar.

Die Artikelnamen stehen in `config/demand.json` und müssen exakt der Schreibweise
in der URL entsprechen, mit Unterstrichen statt Leerzeichen. Falsch geschriebene
Artikel liefern 404 und erscheinen in der Quellenliste als Fehler.

Wikimedia bittet um einen aussagekräftigen User-Agent. Trag unter
`Settings` → `Variables` eine Variable `WIKIMEDIA_UA` mit Kontaktadresse ein:
`TrendRadar/2.1 (https://www.telekonnekt.de; technik@telekonnekt.de)`

**Nachlauf:** Wikimedia veröffentlicht Tageswerte mit rund einem Tag Verzögerung.
Das Skript rechnet die letzten drei Tage deshalb bei jedem Lauf neu
(`DEMAND_RECALC_DAYS`).

---

## Warum nicht Google Trends

Die naheliegende Quelle fällt aus drei Gründen aus.

Die offizielle Trends-API ist seit Juli 2025 in einer antragsgebundenen Alpha und
bis heute nicht allgemein verfügbar. Die verbreitete Bibliothek `pytrends` ist
seit April 2025 archiviert. Inoffizielle Endpunkte funktionieren technisch noch,
aber aus einem GitHub-Runner heraus schlecht: Die Läufer teilen sich
Adressbereiche, die Google aggressiv drosselt.

Dazu ein inhaltliches Problem: Für Nischenbegriffe liefert Trends schlicht Nullen.
„GeDIG" oder „TI-Gateway" liegen unter der Schwelle, ab der überhaupt Daten
ausgegeben werden.

Kommerzielle SERP-Anbieter kämen technisch infrage, sind hier aber die falsche
Wahl: Google hat im Dezember 2025 Klage gegen SerpApi eingereicht, das Verfahren
läuft. Für ein Unternehmen mit ISO-27001-Zertifizierung im Gesundheitssektor ist
ein Dienst mit laufendem Rechtsstreit keine tragfähige Grundlage.

---

## Falls später Budget da ist

**Google Ads Keyword Planner** wäre die richtige Ergänzung: echtes Suchvolumen für
den Gesamtmarkt, anbieterneutral, über die Google Ads API kostenlos nutzbar. Zwei
Haken: Ohne laufende Kampagnen gibt es nur Spannen statt exakter Zahlen, und der
Entwickler-Token muss beantragt werden. Falls ein Ads-Konto mit aktiven Kampagnen
existiert, ist das der nächste sinnvolle Schritt — dann bekämen auch die Themen
ohne Wikipedia-Artikel ein Nachfragesignal.
