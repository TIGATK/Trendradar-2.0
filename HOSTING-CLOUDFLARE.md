# Hosting über Cloudflare Pages

Alles über den Browser. Voraussetzung ist ein Cloudflare-Konto (kostenlos).

---

## Vorab: die eine Einschränkung

Der Zugriffsschutz funktioniert sauber nur mit **eigener Subdomain**, zum Beispiel
`radar.telekonnekt.de`.

Grund: Cloudflare Pages vergibt automatisch eine Adresse wie `trend-radar.pages.dev`.
Die Access-Integration im Pages-Projekt schützt standardmäßig nur die
Vorschau-Adressen (`*.trend-radar.pages.dev`), nicht die produktive `pages.dev`-Adresse
selbst. Die lässt sich zwar auch schützen, indem man in der Access-Anwendung das
Sternchen im Feld `Subdomain` entfernt — das ist aber fummelig und laut Cloudflares
eigener Dokumentation eine bekannte Stolperstelle.

Der saubere Weg: eigene Subdomain als offizielle Adresse, Access-Regel darauf, und die
`pages.dev`-Adresse per Bulk Redirect auf die Subdomain umleiten.

**Wenn keine Subdomain verfügbar ist,** ist GitHub Pages der ehrlichere Weg — dann aber
ohne Zugriffsschutz und mit dem Wissen, dass die Seite öffentlich ist. Ein
`noindex`-Header ist gesetzt, das hält Suchmaschinen fern, aber nicht jemanden, der die
URL kennt.

---

## Schritt 1 — Projekt anlegen

Cloudflare-Dashboard → `Workers & Pages` → `Create` → Reiter `Pages` →
`Connect to Git` → Repository auswählen.

Build-Einstellungen:

| Feld | Wert |
|---|---|
| Framework preset | `None` |
| Build command | **leer lassen** |
| Build output directory | `public` |
| Root directory | `/` |

`Save and Deploy`. Nach einer Minute läuft die Seite unter `<projekt>.pages.dev`.

Kein Build-Schritt nötig — es sind statische Dateien. Die Datei `public/_headers`
setzt Caching und Sicherheitsheader; sie muss in `public/` liegen, nicht im
Wurzelverzeichnis.

## Schritt 2 — Eigene Subdomain

Pages-Projekt → `Custom domains` → `Set up a custom domain` → `radar.telekonnekt.de`.

- Liegt `telekonnekt.de` bereits bei Cloudflare, wird der DNS-Eintrag automatisch gesetzt.
- Liegt die Domain woanders, beim bisherigen DNS-Anbieter einen CNAME anlegen:
  `radar` → `<projekt>.pages.dev`.

Zertifikat kommt automatisch.

## Schritt 3 — Zugriffsschutz

Cloudflare-Dashboard → `Zero Trust` → `Access` → `Applications` → `Add an application`
→ `Self-hosted`.

- **Application domain:** `radar.telekonnekt.de`
- **Policy:** `Allow`, Regel `Emails ending in` → `@telekonnekt.de`
- **Identitätsanbieter:** `One-time PIN` reicht zum Start — Cloudflare schickt einen
  Code per Mail, kein Setup nötig. Falls Entra ID oder Google Workspace im Haus ist,
  lässt sich das später als Anbieter hinterlegen, dann ist es echtes Single Sign-on.

Danach landet jeder Aufruf zuerst auf einer Login-Seite. Das gilt auch für
`data/snapshots.json` — der Browser holt die Datei mit derselben Sitzung, das Radar
funktioniert also normal.

## Schritt 4 — Vorschau-Adressen dichtmachen

Pages-Projekt → `Settings` → `General` → `Access Policy` → `Enable`. Das schützt die
Vorschau-Adressen. Anschließend `Bulk Redirects` einrichten, um
`<projekt>.pages.dev` auf `radar.telekonnekt.de` umzuleiten.

---

## Kosten und Grenzen

Pages ist im kostenlosen Rahmen auf 500 Builds pro Monat begrenzt. Bei einem
Sammellauf pro Tag sind das rund 30. Reichlich Luft.

Der Zugriffsschutz ist im kostenlosen Zero-Trust-Plan bis 50 Nutzer enthalten. Ein Sitz
wird pro angemeldeter Person belegt, nicht pro Gerät. Inaktive Nutzer kann Cloudflare
nach einer einstellbaren Frist automatisch entfernen.

Traffic ist bei Pages nicht mengenbegrenzt.

## Was mit Netlify passiert

`netlify.toml` kann liegen bleiben, Cloudflare ignoriert die Datei. Wenn Netlify parallel
am selben Repository hängt, deployt es weiter — dann läuft das Radar unter zwei Adressen,
und die Netlify-Adresse ist die ungeschützte. Die Netlify-Site also entweder löschen oder
vom Repository trennen.
