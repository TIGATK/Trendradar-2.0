/**
 * Wikimedia Pageviews - taegliche Artikelabrufe als Naeherung fuer
 * oeffentliches Interesse an einem Thema.
 *
 * Vollstaendig offene API, keine Anmeldung, keine Kosten, kein Scraping.
 * Anbieterneutral: gemessen wird das Interesse am Thema, unabhaengig davon,
 * welche Seite dazu rankt. Deckt nur Themen ab, zu denen es einen Artikel gibt.
 *
 * Wikimedia verlangt einen aussagekraeftigen User-Agent mit Kontaktmoeglichkeit.
 */

const UA =
  process.env.WIKIMEDIA_UA ||
  'TrendRadar/2.1 (internes Branchenmonitoring; Kontakt via Repository-Betreiber)';

// Ueberschreibbar, damit die Kette ohne Netzzugriff getestet werden kann.
const BASE =
  process.env.WIKIMEDIA_BASE ||
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

function compact(dateKey) {
  return dateKey.replace(/-/g, '') + '00';
}

/**
 * Tagesabrufe fuer einen Artikel.
 * @returns {Promise<Object<string, number>>} { "YYYY-MM-DD": Abrufe }
 */
export async function fetchPageviews({ projekt, artikel, startDate, endDate }) {
  const url =
    `${BASE}/${projekt}/all-access/user/` +
    encodeURIComponent(artikel) +
    `/daily/${compact(startDate)}/${compact(endDate)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (res.status === 404) {
    throw new Error('Artikel nicht gefunden - Schreibweise pruefen');
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const out = {};
  for (const it of data.items || []) {
    // timestamp kommt als YYYYMMDD00
    const t = String(it.timestamp);
    const key = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
    out[key] = (out[key] || 0) + (it.views || 0);
  }
  return out;
}

/**
 * Alle konfigurierten Artikel abrufen und je Thema summieren.
 * @returns {Promise<{counts: Map<string, Object>, sources: Array}>}
 */
export async function collectWikipedia({ projekt, themen, startDate, endDate }) {
  const jobs = [];
  for (const [id, cfg] of Object.entries(themen)) {
    for (const artikel of cfg.wikipedia || []) jobs.push({ id, artikel });
  }

  // Ein Anlauf reicht nicht immer: der Endpunkt liefert gelegentlich 404,
  // obwohl der Artikel existiert. Deshalb ein zweiter Versuch mit Abstand,
  // bevor eine Quelle als fehlerhaft gemeldet wird.
  const einmalWiederholen = async (j) => {
    try {
      return await fetchPageviews({ projekt, artikel: j.artikel, startDate, endDate });
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1500));
      return await fetchPageviews({ projekt, artikel: j.artikel, startDate, endDate });
    }
  };

  const results = await Promise.allSettled(jobs.map(einmalWiederholen));

  const counts = new Map();
  const sources = [];

  for (let i = 0; i < jobs.length; i++) {
    const { id, artikel } = jobs[i];
    const r = results[i];
    const name = `Wikipedia: ${artikel.replace(/_/g, ' ')}`;
    const url = `https://${projekt.replace('.', '.')}.org/wiki/${artikel}`;

    if (r.status === 'rejected') {
      sources.push({
        name,
        url,
        type: 'Nachfrage',
        status: 'fehler',
        items: 0,
        error: String(r.reason?.message || r.reason).slice(0, 160),
      });
      continue;
    }

    if (!counts.has(id)) counts.set(id, {});
    const target = counts.get(id);
    let total = 0;
    for (const [day, v] of Object.entries(r.value)) {
      target[day] = (target[day] || 0) + v;
      total += v;
    }
    sources.push({ name, url, type: 'Nachfrage', status: 'ok', items: total });
  }

  return { counts, sources };
}
