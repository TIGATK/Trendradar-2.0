# Hosting über die Webflow-Website

Kurzfassung: Die Oberfläche lässt sich problemlos in Webflow einbetten. Die
**Datendatei** kann Webflow aber nicht ausliefern — die muss woanders liegen.
Damit schützt das Webflow-Passwort die Seite, nicht die Daten.

---

## Was passt

Die Größen sind unkritisch. Die Radar-Seite ist rund 25.000 Zeichen (CSS 7.400,
JavaScript 15.200, Markup 1.300). Webflow erlaubt 50.000 Zeichen pro Code-Embed
und je 50.000 in den Head- und Footer-Feldern der Seiteneinstellungen. Der
Einbettungs-Schnipsel selbst braucht keine 2.000.

Seiten-Passwortschutz gibt es ab einem bezahlten Site-Plan: `Page Settings` →
`General` → `Password protection`. Wichtig ist das **Seiten**-Passwort, nicht das
siteweite — sonst hängt ein Passwort vor der kompletten Firmenwebsite.

## Der Haken: die Datendatei

`snapshots.json` ist rund 26 KB minifiziert und wächst mit der Historie. Webflow
nimmt JSON nicht als Asset an, und in ein CMS-Feld passt es nicht. Die Datei muss
also extern liegen, und das Frontend holt sie per `fetch` über Domaingrenzen hinweg.

Brauchbare Ablageorte, alle kostenlos und mit passenden CORS-Headern:

| Ablage | Anmerkung |
|---|---|
| GitHub Pages | Naheliegend, weil das Repository ohnehin existiert. Bei kostenlosem Plan muss es öffentlich sein. |
| `raw.githubusercontent.com` | Ohne extra Einrichtung, ebenfalls nur bei öffentlichem Repository. |
| jsDelivr | CDN vor GitHub, aber aggressives Caching. Bräuchte einen Purge-Aufruf am Ende der Action. |
| Cloudflare Pages | Ohne Access davor. Dann ist Cloudflare nur noch Dateiablage. |

**Die Konsequenz ehrlich benannt:** Wer die URL der JSON-Datei kennt, kann sie
lesen — unabhängig vom Webflow-Passwort. Der Inhalt besteht aus aggregierten
öffentlichen Pressemeldungen, das ist für sich genommen harmlos. Nach außen
sichtbar wird aber, **welche Themen und welche Akteure Telekonnekt beobachtet**.
Ob das stört, ist eine Einschätzung, die ihr treffen müsst.

Wenn die Daten nicht öffentlich sein dürfen, führt kein Weg an einem Host mit
echtem Zugriffsschutz vorbei — dann Cloudflare Pages mit Access. Ein Token im
JavaScript hilft nicht, das steht im Quelltext der Seite.

## Warum iframe statt direkt eingebettet

Das Radar bringt eigene globale Styles mit. Direkt in eine Webflow-Seite gepastet
kollidieren die mit dem Website-CSS, in beide Richtungen. Man kann das auflösen,
indem man jede Regel unter eine Wrapper-Klasse zieht — dann existieren aber zwei
Varianten derselben Oberfläche, die mit jeder Änderung weiter auseinanderlaufen.

Der iframe kapselt sauber, es bleibt bei einer Codebasis, und die Höhe wächst
automatisch mit: Das Radar meldet seine Höhe per `postMessage`, der Schnipsel in
`webflow-embed.html` setzt sie.

Wenn ihr das Radar trotzdem nativ in die Seite integriert haben wollt, sag
Bescheid — dann baue ich eine Variante mit vollständig gekapseltem CSS.

## Einrichtung

1. Statische Dateien irgendwo ablegen, wo sie erreichbar sind — am einfachsten
   GitHub Pages über den mitgelieferten Workflow `pages.yml`.
2. In Webflow eine Seite anlegen, etwa `/intern/trend-radar`.
3. `Page Settings` → `General` → `Password protection` einschalten.
4. `Page Settings` → `SEO` → `noindex` setzen und die Seite aus der Sitemap nehmen.
5. Code-Embed-Element auf die Seite ziehen, Inhalt aus `webflow-embed.html`
   einfügen, die `src`-URL anpassen.
6. Veröffentlichen.

Alternativ ohne iframe-Quelle im Netz: Nur die JSON-Datei extern ablegen und im
Embed `window.RADAR_DATA_URL` auf deren Adresse setzen. Dann muss allerdings die
komplette Radar-Oberfläche mit ins Embed, samt CSS-Kapselung.

## Was ihr euch gegenüber Cloudflare Access einhandelt

| | Webflow-Seitenpasswort | Cloudflare Access |
|---|---|---|
| Anmeldung | ein geteiltes Passwort für alle | pro Person, Firmen-Mail oder SSO |
| Entzug | Passwort ändern, alle neu informieren | eine Person entfernen |
| Nachvollziehbarkeit | keine | Protokoll je Anmeldung |
| Schützt die Daten | nein | ja |
| Aufwand | drei Klicks | Subdomain plus Access-Regel |

Für ein internes Beobachtungswerkzeug mit einer Handvoll Nutzern ist das
Seitenpasswort vertretbar. Sobald ihr die Daten nicht öffentlich haben wollt oder
nachvollziehen müsst, wer zugreift, ist es das nicht mehr.
