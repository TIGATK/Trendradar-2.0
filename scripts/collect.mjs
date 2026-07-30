#!/usr/bin/env node
/**
 * Trend-Radar - Sammeln, Klassifizieren, Fortschreiben
 *
 * Node 20+, keine Abhaengigkeiten (nur globales fetch).
 *
 * Wichtigster Unterschied zur ersten Fassung: der Snapshot wird nicht mehr
 * bei jedem Lauf neu geschrieben, sondern fortgeschrieben. Tageswerte aelter
 * als RECALC_DAYS bleiben eingefroren. Dadurch entsteht ueber die Zeit eine
 * echte Historie, statt einer Kurve, die nur die Reichweite der RSS-Feeds
 * abbildet.
 *
 * Env:
 *   ANTHROPIC_API_KEY  Pflicht (ausser bei DRY_RUN=true)
 *   CLAUDE_MODEL       Standard claude-sonnet-5        (Einordnung je Thema)
 *   CLAUDE_MODEL_FAST  Standard claude-haiku-4-5-...   (Klassifikation)
 *   DAYS               Standard 90   Fensterbreite der Ausgabe
 *   RECALC_DAYS        Standard 3    Tage, die neu berechnet werden
 *   MAX_PER_SOURCE     Standard 60   Deckel je Quelle, nicht global
 *   DRY_RUN            true = kein Schreiben, kein API-Call, nur Bericht
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { collectWikipedia } from './lib/wikipedia.mjs';

const ROOT = process.cwd();
const P = {
  topics: path.join(ROOT, 'config', 'topics.json'),
  feeds: path.join(ROOT, 'config', 'feeds.json'),
  roadmap: path.join(ROOT, 'config', 'roadmap.json'),
  demand: path.join(ROOT, 'config', 'demand.json'),
  out: path.join(ROOT, 'public', 'data', 'snapshots.json'),
};

const DAYS = num(process.env.DAYS, 90);
const RECALC_DAYS = num(process.env.RECALC_DAYS, 3);
const MAX_PER_SOURCE = num(process.env.MAX_PER_SOURCE, 60);
const DRY_RUN = String(process.env.DRY_RUN) === 'true';
const NO_LLM = String(process.env.NO_LLM) === 'true';
const MIN_SOURCES = num(process.env.MIN_SOURCES, 2);
const MIN_ITEMS = num(process.env.MIN_ITEMS, 5);
// Wikimedia veroeffentlicht Tageswerte mit rund einem Tag Verzoegerung.
const DEMAND_RECALC_DAYS = num(process.env.DEMAND_RECALC_DAYS, 3);
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const MODEL_FAST = process.env.CLAUDE_MODEL_FAST || 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY;

const UA =
  'Mozilla/5.0 (compatible; TrendRadar/2.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 20000;
const TZ = 'Europe/Berlin';

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

/* ---------------------------------------------------------------- Datum */

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Date -> "YYYY-MM-DD" in Europe/Berlin. Fixiert die Tagesgrenze. */
function dayKey(d) {
  return dayFmt.format(d);
}

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function dayList(endKey, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}

/* ------------------------------------------------------------- Hilfsmittel */

function log(...a) {
  console.log('[radar]', ...a);
}

async function fetchText(url, extra = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'User-Agent': UA,
      Accept:
        'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.6',
      ...(extra.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function unwrapCdata(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeOnce(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Zwei Durchgaenge, weil etliche Feeds doppelt kodieren (&amp;quot;). */
function decodeEntities(s) {
  if (!s) return '';
  return decodeOnce(decodeOnce(unwrapCdata(s)));
}

/**
 * Reihenfolge ist entscheidend:
 * 1. CDATA aufloesen - sonst frisst /<[^>]*>/ den ganzen Block bis zum ">"
 *    in "]]>" und damit den kompletten Titel.
 * 2. Tags entfernen.
 * 3. Entities dekodieren.
 * 4. Nochmal Tags entfernen - viele Feeds liefern in <description> HTML,
 *    das erst nach dem Dekodieren als Markup sichtbar wird.
 */
function stripTags(s) {
  let t = unwrapCdata(String(s || ''));
  t = t.replace(/<[^>]*>/g, ' ');
  t = decodeEntities(t);
  t = t.replace(/<[^>]*>/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

/** Titel auf Vergleichsform bringen - fuer Dedup ueber syndizierte PM hinweg. */
function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"'`]/g, '')
    .replace(/\u00e4/g, 'ae').replace(/\u00f6/g, 'oe').replace(/\u00fc/g, 'ue')
    .replace(/\u00df/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|source)/i.test(k)) x.searchParams.delete(k);
    }
    return x.origin + x.pathname.replace(/\/$/, '') + (x.search || '');
  } catch {
    return String(u || '');
  }
}

/* ---------------------------------------------------------------- Parser */

/** Toleranter RSS/Atom-Parser. Gibt {title, desc, url, date} zurueck. */
function parseFeed(xml) {
  const items = [];
  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];

  for (const b of blocks) {
    const block = b[1];
    const title = stripTags(tag(block, 'title'));
    if (!title) continue;

    let url = stripTags(tag(block, 'link'));
    if (!url) {
      const alt =
        block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
        block.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (alt) url = decodeEntities(alt[1]);
    }
    if (!url) {
      const guid = stripTags(tag(block, 'guid'));
      if (/^https?:/i.test(guid)) url = guid;
    }

    const descRaw =
      tag(block, 'description') ||
      tag(block, 'summary') ||
      tag(block, 'content:encoded') ||
      tag(block, 'content');

    const dateRaw =
      stripTags(tag(block, 'pubDate')) ||
      stripTags(tag(block, 'published')) ||
      stripTags(tag(block, 'updated')) ||
      stripTags(tag(block, 'dc:date'));

    items.push({
      title,
      desc: stripTags(descRaw).slice(0, 300),
      url: url.trim(),
      date: dateRaw,
    });
  }
  return items;
}

/**
 * Datum robust aufloesen. Fehlt oder ist es unbrauchbar, wird der Beitrag
 * NICHT auf heute gesetzt - das wuerde die Kurve systematisch nach rechts
 * verzerren. Er bekommt dateOk=false und wird nur gezaehlt, wenn er neu ist.
 */
function resolveDay(raw, todayKey) {
  if (!raw) return { key: todayKey, ok: false };
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return { key: todayKey, ok: false };
  const d = new Date(t);
  const key = dayKey(d);
  if (key > todayKey) return { key: todayKey, ok: true };
  return { key, ok: true };
}

/* ----------------------------------------------------------------- Quellen */

/**
 * Zweistufiger Stichwortabgleich.
 *
 * Naives Teilstring-Matching produziert Fehltreffer: "bsi" steckt in
 * beliebigen Woertern, und ein heise-Artikel ueber eine Windows-Luecke, der
 * das BSI erwaehnt, hat mit der TI nichts zu tun.
 *
 * Deshalb: starke Begriffe sind allein aussagekraeftig, schwache brauchen
 * einen zweiten Treffer. Beide werden auf Wortgrenzen geprueft.
 */
function buildMatcher(cfg) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \b funktioniert bei Begriffen mit Bindestrich am Rand nicht zuverlaessig,
  // deshalb eigene Grenzen: Anfang/Ende oder ein Zeichen, das kein Buchstabe ist.
  const rx = (t) => new RegExp('(^|[^a-z0-9\u00e4\u00f6\u00fc\u00df])' + esc(t) + '($|[^a-z0-9\u00e4\u00f6\u00fc\u00df])', 'i');

  const stark = (cfg.keywords_stark || []).map((k) => ({ k, re: rx(k.toLowerCase()) }));
  const schwach = (cfg.keywords_schwach || []).map((k) => ({ k, re: rx(k.toLowerCase()) }));

  return function match(text) {
    const t = ' ' + String(text || '').toLowerCase() + ' ';
    for (const e of stark) if (e.re.test(t)) return e.k;
    const hits = [];
    for (const e of schwach) {
      if (e.re.test(t)) hits.push(e.k);
      if (hits.length >= 2) return hits.join('+');
    }
    return null;
  };
}

/**
 * Text fuer den Stichwortabgleich vorbereiten.
 *
 * Hashtags muessen raus, sonst ist der Abgleich ein Zirkelschluss: Wer nach
 * #ePA sucht und dann prueft, ob "epa" im Text steht, bekommt immer ein Ja -
 * der Hashtag steht ja im Beitrag. Gepruefte Aussage soll aber der Inhalt sein,
 * nicht das Suchkriterium.
 *
 * Der Titel bleibt unveraendert, nur der Abgleich sieht die gekuerzte Fassung.
 */
function textZumAbgleich(text) {
  return String(text || '')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Externe Links aus Social-HTML ziehen, vor dem Entfernen der Tags. */
function extractLinks(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/href=["']([^"']+)["']/gi)) {
    const u = decodeEntities(m[1]);
    // Hashtags und Profilverweise sind keine Quellen
    if (/\/tags\/|\/@|mailto:/i.test(u)) continue;
    if (!/^https?:/i.test(u)) continue;
    out.push(u);
  }
  return out;
}

async function collectRss(feedsCfg, todayKey, match) {
  const sources = [];
  const items = [];

  const results = await Promise.allSettled(
    feedsCfg.feeds.map(async (f) => {
      const xml = await fetchText(f.url);
      return { f, parsed: parseFeed(xml) };
    })
  );

  for (let i = 0; i < results.length; i++) {
    const f = feedsCfg.feeds[i];
    const r = results[i];

    if (r.status === 'rejected') {
      sources.push({
        name: f.name,
        url: f.url,
        type: 'RSS',
        status: 'fehler',
        items: 0,
        error: String(r.reason?.message || r.reason).slice(0, 160),
      });
      continue;
    }

    let got = r.value.parsed;
    if (got.length === 0) {
      sources.push({
        name: f.name,
        url: f.url,
        type: 'RSS',
        status: 'fehler',
        items: 0,
        error: 'Antwort enthielt keine lesbaren Eintraege',
      });
      continue;
    }

    if (f.filter) {
      got = got
        .map((it) => ({ ...it, match: match(it.title + ' ' + it.desc) }))
        .filter((it) => it.match);
    }

    got = got
      .map((it) => {
        const d = resolveDay(it.date, todayKey);
        return { ...it, day: d.key, dateOk: d.ok, source: f.name, type: 'RSS' };
      })
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .slice(0, MAX_PER_SOURCE);

    items.push(...got);
    sources.push({
      name: f.name,
      url: f.url,
      type: 'RSS',
      status: 'ok',
      items: got.length,
    });
  }

  return { sources, items };
}

async function collectBluesky(cfg, todayKey, match) {
  const sources = [];
  const items = [];
  for (const q of cfg.queries || []) {
    const url =
      'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?limit=50&q=' +
      encodeURIComponent(q);
    try {
      const json = JSON.parse(await fetchText(url));
      const posts = json.posts || [];
      let genommen = 0;
      for (const p of posts) {
        const text = String(p.record?.text || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const d = resolveDay(p.record?.createdAt, todayKey);
        const ref = p.record?.embed?.external?.uri || null;
        // Social laeuft durch denselben Stichwortabgleich wie breite RSS-Quellen.
        // Ein Hashtag wie #Digitalisierung sagt nichts darueber, ob es um
        // Gesundheitswesen oder um Schulen geht.
        const treffer = cfg.filter === false ? 'ungefiltert' : match(textZumAbgleich(text));
        if (!treffer) continue;
        genommen++;
        items.push({
          match: treffer,
          title: text.slice(0, 200),
          desc: '',
          refUrl: ref,
          url: `https://bsky.app/profile/${p.author?.did}/post/${String(p.uri).split('/').pop()}`,
          day: d.key,
          dateOk: d.ok,
          source: 'Bluesky: ' + q,
          type: 'Social',
        });
      }
      sources.push({
        name: 'Bluesky: ' + q,
        url,
        type: 'Social',
        status: 'ok',
        items: genommen,
        roh: posts.length,
      });
    } catch (e) {
      sources.push({
        name: 'Bluesky: ' + q,
        url,
        type: 'Social',
        status: 'fehler',
        items: 0,
        error: String(e.message || e).slice(0, 160),
      });
    }
  }
  return { sources, items };
}

async function collectMastodon(cfg, todayKey, match) {
  const sources = [];
  const items = [];
  for (const t of cfg.tags || []) {
    const url = `${cfg.instance}/api/v1/timelines/tag/${encodeURIComponent(t)}?limit=40`;
    try {
      const arr = JSON.parse(await fetchText(url));
      let genommen = 0;
      for (const s of arr) {
        const text = stripTags(s.content);
        if (!text) continue;
        const d = resolveDay(s.created_at, todayKey);
        // Der verlinkte Artikel ist die eigentliche Quelle. Zwei Beitraege mit
        // demselben Link sind derselbe Vorgang - haeufig dieselbe Meldung auf
        // Deutsch und Englisch von einem Spiegel-Konto.
        const links = extractLinks(s.content).concat(
          (s.card && s.card.url) ? [s.card.url] : []
        );
        const treffer = cfg.filter === false ? 'ungefiltert' : match(textZumAbgleich(text));
        if (!treffer) continue;
        genommen++;
        items.push({
          match: treffer,
          title: text.slice(0, 200),
          desc: '',
          refUrl: links[0] || null,
          url: s.url || s.uri,
          day: d.key,
          dateOk: d.ok,
          source: 'Mastodon: #' + t,
          type: 'Social',
        });
      }
      sources.push({
        name: 'Mastodon: #' + t,
        url,
        type: 'Social',
        status: 'ok',
        items: genommen,
        roh: arr.length,
      });
    } catch (e) {
      sources.push({
        name: 'Mastodon: #' + t,
        url,
        type: 'Social',
        status: 'fehler',
        items: 0,
        error: String(e.message || e).slice(0, 160),
      });
    }
  }
  return { sources, items };
}

/* ------------------------------------------------------------- Nachfrage */

/**
 * Zweites Signal: oeffentliches Interesse an einem Thema.
 *
 * Bewusst anbieterneutral - gemessen wird das Thema, nicht wer dazu rankt.
 *
 * Kein SERP-Scraping: der Rechtsstreit zwischen Google und SerpApi macht
 * kommerzielle Scraper zu einer ungeeigneten Grundlage. Google Trends faellt
 * ebenfalls aus, die offizielle API ist weiterhin antragsgebunden und die
 * inoffiziellen Endpunkte sind aus einem GitHub-Runner heraus unzuverlaessig.
 */
async function collectDemand(cfg, startDate, endDate) {
  const interesse = new Map();
  const sources = [];

  function merge(map, id, obj) {
    if (!map.has(id)) map.set(id, {});
    const t = map.get(id);
    for (const [d, v] of Object.entries(obj)) t[d] = (t[d] || 0) + v;
  }

  /* --- Wikipedia --- */
  if (cfg.wikipedia?.aktiv) {
    try {
      const { counts: wc, sources: ws } = await collectWikipedia({
        projekt: cfg.wikipedia.projekt || 'de.wikipedia',
        themen: cfg.themen,
        startDate,
        endDate,
      });
      for (const [id, obj] of wc) merge(interesse, id, obj);
      sources.push(...ws);
    } catch (e) {
      log('Wikipedia fehlgeschlagen: ' + e.message);
    }
  }

  return { interesse, sources };
}

/* ---------------------------------------------------------- Klassifikation */

async function anthropic(model, system, user, maxTokens = 4000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

function parseJsonLoose(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('[');
  const b = t.lastIndexOf(']');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

/**
 * Beitraege in die feste Taxonomie einsortieren. Batchweise, damit ein
 * einzelner Fehlschlag nicht den ganzen Lauf kostet.
 */
/** Stichwortbasierte Notzuordnung. Kein Ersatz fuer das Modell, aber genug,
 *  um die Kette ohne API-Kosten zu testen (NO_LLM=true) oder einen Ausfall
 *  der API zu ueberbruecken. */
function classifyByKeywords(items, topics) {
  const table = topics
    .filter((t) => t.hints)
    .map((t) => ({
      id: t.id,
      words: t.hints.toLowerCase().split(',').map((w) => w.trim()).filter(Boolean),
    }));

  return items.map((it) => {
    const hay = (it.title + ' ' + it.desc).toLowerCase();
    let best = { id: 'sonstiges', score: 0 };
    for (const t of table) {
      const score = t.words.reduce((a, w) => a + (hay.includes(w) ? w.length : 0), 0);
      if (score > best.score) best = { id: t.id, score };
    }
    return { ...it, topic: best.id, orgs: [], people: [] };
  });
}

async function classify(items, topics) {
  if (NO_LLM) {
    log('NO_LLM=true - Zuordnung per Stichwort, keine Modellaufrufe');
    return classifyByKeywords(items, topics);
  }
  const ids = topics.map((t) => t.id);
  const katalog = topics
    .map((t) => `- ${t.id}: ${t.name}. ${t.desc}${t.hints ? ' Signalwoerter: ' + t.hints : ''}`)
    .join('\n');

  const system = `Du sortierst deutschsprachige Nachrichtenbeitraege aus der Branche Telematikinfrastruktur und Healthcare-IT in eine FESTE Themenliste ein.

Themenliste:
${katalog}

Regeln:
- Ordne jedem Beitrag genau eine topic-ID aus der Liste zu. Erfinde keine neuen IDs.
- Passt nichts, nimm "sonstiges". Lieber "sonstiges" als eine erzwungene Zuordnung.
- orgs: genannte Unternehmen, Behoerden, Verbaende, Kassen. Nur was wirklich im Text steht, maximal 3.
- people: genannte Personen mit vollem Namen. Nur was wirklich im Text steht, maximal 2. Meist leer.
- Antworte AUSSCHLIESSLICH mit einem JSON-Array, ohne Vorwort, ohne Markdown.

Format: [{"i":0,"topic":"epa","orgs":["gematik"],"people":[]}]`;

  const BATCH = 40;
  const out = new Map();

  for (let s = 0; s < items.length; s += BATCH) {
    const batch = items.slice(s, s + BATCH);
    const user = batch
      .map((it, k) => `${k}. [${it.source}] ${it.title}${it.desc ? ' — ' + it.desc.slice(0, 160) : ''}`)
      .join('\n');

    try {
      const raw = await anthropic(MODEL_FAST, system, user, 4000);
      const arr = parseJsonLoose(raw);
      for (const r of arr) {
        const k = Number(r.i);
        if (!Number.isInteger(k) || !batch[k]) continue;
        out.set(s + k, {
          topic: ids.includes(r.topic) ? r.topic : 'sonstiges',
          orgs: Array.isArray(r.orgs) ? r.orgs.slice(0, 3) : [],
          people: Array.isArray(r.people) ? r.people.slice(0, 2) : [],
        });
      }
      log(`klassifiziert ${Math.min(s + BATCH, items.length)}/${items.length}`);
    } catch (e) {
      log(`Batch ab ${s} fehlgeschlagen: ${e.message} - faellt auf "sonstiges" zurueck`);
    }
  }

  return items.map((it, i) => ({
    ...it,
    ...(out.get(i) || { topic: 'sonstiges', orgs: [], people: [] }),
  }));
}

/** Kurze Einordnung je Thema aus den Schlagzeilen der letzten Tage. */
async function summarize(topicsWithHeads) {
  if (NO_LLM) return new Map();
  const system = `Du schreibst fuer ein internes Branchen-Monitoring zur Telematikinfrastruktur.
Fasse je Thema in maximal zwei Saetzen zusammen, was in den Schlagzeilen konkret passiert ist.
Sachlich, deutsch, keine Gendersprache, keine Floskeln, keine Bewertung.
Wenn die Schlagzeilen zu duenn fuer eine Aussage sind, schreibe genau: "Zu wenig Material fuer eine Einordnung."
Antworte AUSSCHLIESSLICH mit einem JSON-Array: [{"id":"epa","text":"..."}]`;

  const user = topicsWithHeads
    .map(
      (t) =>
        `## ${t.id} (${t.name})\n` +
        t.heads.slice(0, 12).map((h) => `- ${h.d} ${h.t}`).join('\n')
    )
    .join('\n\n');

  try {
    const raw = await anthropic(MODEL, system, user, 2000);
    const arr = parseJsonLoose(raw);
    const m = new Map(arr.map((x) => [x.id, String(x.text || '').slice(0, 400)]));
    return m;
  } catch (e) {
    log('Einordnung fehlgeschlagen: ' + e.message);
    return new Map();
  }
}

/* ----------------------------------------------------------------- Signale */

/**
 * Ein Signal fortschreiben und auswerten.
 *
 * Alle Signale folgen derselben Regel: Werte aelter als das Nachrechenfenster
 * werden eingefroren, damit ueber die Zeit eine echte Historie entsteht statt
 * einer Kurve, die nur die Reichweite der Quelle abbildet.
 *
 * @param {Object} neu        neue Tageswerte { "YYYY-MM-DD": n }
 * @param {Object} alt        Tageswerte aus dem vorherigen Snapshot
 * @param {string[]} window   Tage des Ausgabefensters
 * @param {string} cutoff     aeltester Tag im Fenster
 * @param {string} recalcFrom ab hier wird neu gerechnet
 */
function buildSignal(neu, alt, window, cutoff, recalcFrom) {
  const counts = {};
  for (const [k, v] of Object.entries(alt || {})) {
    if (k >= cutoff && k < recalcFrom) counts[k] = v;
  }
  for (const [k, v] of Object.entries(neu || {})) {
    if (k < cutoff) continue;
    if (k < recalcFrom && counts[k] !== undefined) continue;
    counts[k] = v;
  }

  const series = window.map((d) => counts[d] || 0);
  const last7 = sum(series.slice(-7));
  const prev7 = sum(series.slice(-14, -7));

  return {
    counts,
    series,
    smooth: rollingMean(series, 7),
    total: sum(series),
    last7,
    prev7,
    momentum: prev7 > 0 ? Number((last7 / prev7).toFixed(2)) : last7 > 0 ? null : 0,
    hat: series.some((v) => v > 0),
  };
}

/* --------------------------------------------------------------- Kennzahlen */

function rollingMean(series, w = 7) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const from = Math.max(0, i - w + 1);
    const slice = series.slice(from, i + 1);
    out.push(Number((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2)));
  }
  return out;
}

function sum(a) {
  return a.reduce((x, y) => x + y, 0);
}

/* ------------------------------------------------------------------- Main */

async function main() {
  const t0 = Date.now();
  const topicsCfg = JSON.parse(await readFile(P.topics, 'utf8'));
  const feedsCfg = JSON.parse(await readFile(P.feeds, 'utf8'));
  const roadmapCfg = existsSync(P.roadmap)
    ? JSON.parse(await readFile(P.roadmap, 'utf8'))
    : { eintraege: [] };
  const demandCfg = existsSync(P.demand)
    ? JSON.parse(await readFile(P.demand, 'utf8'))
    : { themen: {} };

  const topics = topicsCfg.topics.filter((t) => t.aktiv !== false);
  const todayKey = dayKey(new Date());
  const window = dayList(todayKey, DAYS);
  const cutoff = addDays(todayKey, -(DAYS - 1));
  const recalcFrom = addDays(todayKey, -(RECALC_DAYS - 1));

  log(`Fenster ${window[0]} bis ${todayKey} (${DAYS} Tage), Neuberechnung ab ${recalcFrom}`);

  /* --- Sammeln --- */
  const sources = [];
  const raw = [];

  const match = buildMatcher(feedsCfg);
  const rss = await collectRss(feedsCfg, todayKey, match);
  sources.push(...rss.sources);
  raw.push(...rss.items);

  if (feedsCfg.social?.bluesky?.aktiv) {
    const b = await collectBluesky(feedsCfg.social.bluesky, todayKey, match);
    sources.push(...b.sources);
    raw.push(...b.items);
  }
  if (feedsCfg.social?.mastodon?.aktiv) {
    const m = await collectMastodon(feedsCfg.social.mastodon, todayKey, match);
    sources.push(...m.sources);
    raw.push(...m.items);
  }

  const okSources = sources.filter((s) => s.status === 'ok').length;
  log(`Quellen: ${okSources} ok, ${sources.length - okSources} fehlerhaft, ${raw.length} Rohbeitraege`);

  /* --- Entdoppeln --- */
  const seen = new Set();
  const items = [];
  let dubletten = 0;
  for (const it of raw) {
    if (it.day < cutoff) continue;
    const keys = ['u:' + normUrl(it.url), 't:' + normTitle(it.title)];
    // Verlinkter Originalartikel: faengt dieselbe Meldung in zwei Sprachen
    // und Social-Beitraege, die einen bereits erfassten RSS-Artikel teilen.
    if (it.refUrl) keys.push('r:' + normUrl(it.refUrl));
    if (keys.some((k) => seen.has(k))) { dubletten++; continue; }
    for (const k of keys) seen.add(k);
    items.push(it);
  }
  log(`nach Entdopplung und Zeitfilter: ${items.length} Beitraege (${dubletten} Dubletten entfernt)`);

  /* --- Nachfragesignal --- */
  const demandRecalcFrom = addDays(todayKey, -(DEMAND_RECALC_DAYS - 1));
  const demand = await collectDemand(demandCfg, cutoff, todayKey);
  sources.push(...demand.sources);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN - Quellenstatus ===');
    for (const s of sources) {
      const quote = s.roh != null && s.roh !== s.items ? ` (von ${s.roh} roh)` : '';
      console.log(
        `${s.status === 'ok' ? 'OK  ' : 'FEHL'} ${String(s.items).padStart(4)}  ${s.name}${quote}` +
          (s.error ? `  -> ${s.error}` : '')
      );
    }
    console.log('\n=== Beispielbeitraege ===');
    for (const it of items.slice(0, 30)) {
      const grund = it.match ? ` {${it.match}}` : '';
      console.log(`${it.day}  [${it.source}]${grund}  ${it.title.slice(0, 110)}`);
    }
    // Verteilung je Quelle - zeigt sofort, ob eine Quelle den Rest erdrueckt.
    console.log('\n=== Beitraege je Quelle ===');
    const perSource = {};
    for (const it of items) perSource[it.source] = (perSource[it.source] || 0) + 1;
    for (const [k, v] of Object.entries(perSource).sort((a, b) => b[1] - a[1])) {
      console.log(`${String(v).padStart(4)}  ${k}`);
    }
    const zeig = (titel, map) => {
      console.log(`\n=== ${titel} ===`);
      if (!map.size) return console.log('(keine Daten)');
      for (const [id, obj] of map) {
        const s2 = Object.values(obj).reduce((a, b) => a + b, 0);
        console.log(`${id.padEnd(14)} ${String(s2).padStart(8)} ueber ${Object.keys(obj).length} Tage`);
      }
    };
    zeig('Oeffentliches Interesse (Wikipedia)', demand.interesse);
    console.log(`\nGesamt ${items.length} Beitraege. Nichts geschrieben, kein Modellaufruf.`);
    return;
  }

  if (!API_KEY && !NO_LLM) {
    console.error('ANTHROPIC_API_KEY fehlt. Abbruch ohne Schreiben. Zum Testen ohne Modell: NO_LLM=true.');
    process.exit(1);
  }

  /* --- Klassifizieren --- */
  const classified = await classify(items, topics);

  /* --- Vorherigen Snapshot laden --- */
  let prev = null;
  if (existsSync(P.out)) {
    try {
      const p = JSON.parse(await readFile(P.out, 'utf8'));
      if (p && p.schema >= 3 && p.live) prev = p;
      else log('Vorheriger Snapshot ist Beispieldatei oder altes Format - wird ersetzt');
    } catch {
      log('Vorheriger Snapshot nicht lesbar - wird ersetzt');
    }
  }
  const prevById = new Map((prev?.topics || []).map((t) => [t.id, t]));

  /* --- Je Thema zusammenbauen --- */
  const outTopics = [];

  for (const t of topics) {
    const mine = classified.filter((c) => c.topic === t.id);
    const old = prevById.get(t.id) || {};

    // Rohzaehler fuer die Branchenaktivitaet (Presse + Social).
    const roh = {};
    for (const it of mine) roh[it.day] = (roh[it.day] || 0) + 1;

    const oldSig = old.signals || {};
    const signals = {
      aktivitaet: buildSignal(roh, (oldSig.aktivitaet || {}).counts, window, cutoff, recalcFrom),
      interesse: buildSignal(
        demand.interesse.get(t.id),
        (oldSig.interesse || {}).counts,
        window, cutoff, demandRecalcFrom
      ),
    };

    // Schlagzeilen: neue mit den bisherigen zusammenfuehren, nach Datum sortiert.
    const headMap = new Map();
    for (const h of old.heads || []) headMap.set(normUrl(h.u), h);
    for (const it of mine) {
      const [, mm, dd] = it.day.split('-');
      headMap.set(normUrl(it.url), {
        t: it.title.slice(0, 180),
        s: it.source,
        d: `${dd}.${mm}.`,
        u: it.url,
        iso: it.day,
      });
    }
    const heads = [...headMap.values()]
      .filter((h) => !h.iso || h.iso >= cutoff)
      .sort((a, b) => String(b.iso || '').localeCompare(String(a.iso || '')))
      .slice(0, 30);

    // Akteure: neue Nennungen gewichten, alte behalten aber abwerten.
    const orgTally = new Map();
    const peopleTally = new Map();
    for (const o of old.orgs || []) orgTally.set(o, (orgTally.get(o) || 0) + 1);
    for (const p of old.people || []) peopleTally.set(p, (peopleTally.get(p) || 0) + 1);
    for (const it of mine) {
      for (const o of it.orgs) orgTally.set(o, (orgTally.get(o) || 0) + 2);
      for (const p of it.people) peopleTally.set(p, (peopleTally.get(p) || 0) + 2);
    }
    const top = (m, n) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);

    outTopics.push({
      id: t.id,
      name: t.name,
      cmsKategorie: t.cmsKategorie || null,
      color: t.color,
      desc: t.desc,
      signals,
      orgs: top(orgTally, 6),
      people: top(peopleTally, 4),
      heads,
      note: '',
    });
  }

  // Share of Voice, damit die Zahlen unabhaengig von der Quellenzahl lesbar sind.
  const grand = sum(outTopics.map((t) => t.signals.aktivitaet.last7)) || 1;
  for (const t of outTopics) {
    t.share = Number((t.signals.aktivitaet.last7 / grand).toFixed(3));
  }

  /* --- Einordnung --- */
  const notes = await summarize(outTopics.filter((t) => t.heads.length > 0 && t.id !== 'sonstiges'));
  for (const t of outTopics) t.note = notes.get(t.id) || '';

  /* --- Roadmap --- */
  const roadmap = (roadmapCfg.eintraege || [])
    .filter((e) => e.datum && e.text)
    .map((e) => ({
      datum: e.datum,
      topic: e.topic || null,
      text: String(e.text).slice(0, 90),
      quelle: e.quelle || null,
      geprueft: e.geprueft || null,
      genauigkeit: e.genauigkeit || 'tag',
    }))
    .sort((a, b) => a.datum.localeCompare(b.datum));

  /* --- Snapshot --- */
  const snapshot = {
    schema: 3,
    signale: [
      { id: 'aktivitaet', name: 'Branchenaktivitaet',
        desc: 'Erwaehnungen in Fachpresse, Pressestellen und offenen Social-Netzwerken. Was in der Branche passiert.',
        einheit: 'Beitraege', aktiv: true },
      { id: 'interesse', name: 'Oeffentliches Interesse',
        desc: 'Abrufe der einschlaegigen Wikipedia-Artikel. Wonach unabhaengig von einzelnen Anbietern gesucht wird.',
        einheit: 'Abrufe', aktiv: outTopics.some((t) => t.signals.interesse.hat) },
    ],
    live: true,
    generated: new Date().toISOString(),
    today: todayKey,
    startDate: window[0],
    endDate: todayKey,
    days: DAYS,
    stats: {
      beitraege: items.length,
      quellenOk: okSources,
      quellenFehler: sources.length - okSources,
      laufzeitSek: Math.round((Date.now() - t0) / 1000),
    },
    sources: sources.sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name)),
    topics: outTopics,
    roadmap,
  };

  /* --- Validierung vor dem Schreiben --- */
  const fehler = [];
  if (okSources < MIN_SOURCES) fehler.push(`nur ${okSources} funktionierende Quellen (Mindestwert ${MIN_SOURCES})`);
  if (items.length < MIN_ITEMS) fehler.push(`nur ${items.length} Beitraege gesammelt (Mindestwert ${MIN_ITEMS})`);
  if (outTopics.every((t) => t.signals.aktivitaet.total === 0)) fehler.push('kein Thema hat Treffer');
  if (fehler.length) {
    console.error('Snapshot nicht plausibel: ' + fehler.join('; ') + '. Nichts geschrieben.');
    process.exit(2);
  }

  await mkdir(path.dirname(P.out), { recursive: true });
  await writeFile(P.out, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  log(`geschrieben: ${P.out} (${items.length} Beitraege, ${okSources} Quellen, ${snapshot.stats.laufzeitSek}s)`);
}

main().catch((e) => {
  console.error('Abbruch:', e);
  process.exit(1);
});
