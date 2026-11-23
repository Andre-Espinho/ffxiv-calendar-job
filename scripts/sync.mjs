// Reads the official Lodestone Atom feeds, pulls scheduled dates out of each
// article, and merges them into data/events.json. Entries are kept after they
// drop off the feeds, so the calendar builds up over time.
// No dependencies: needs Node 20 or newer (built-in fetch).
//
// Usage:  node scripts/sync.mjs                 (fetch live feeds)
//         node scripts/sync.mjs --file a.xml:topics --file b.xml:news   (offline test)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REGION = process.env.LODESTONE_REGION || 'na';           // na, eu, fr, de, jp
const OUT = process.env.EVENTS_FILE || 'data/events.json';
const MANUAL = process.env.MANUAL_FILE || 'data/manual-events.json';
const KEEP_DAYS = 400;                                           // drop events that ended longer ago than this
const FEEDS = {
  news: `https://${REGION}.finalfantasyxiv.com/lodestone/news/news.xml`,
  topics: `https://${REGION}.finalfantasyxiv.com/lodestone/news/topics.xml`,
};

// ---------- Atom parsing ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]).trim() : ''; };

export function parseFeed(xml, feed) {
  const out = [];
  for (const [, e] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const link = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || e.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/) || [])[1] || '';
    const html = tag(e, 'content') || tag(e, 'summary');
    const text = decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '))
      .replace(/[ \t ]+/g, ' ');
    out.push({
      id: link.split('/').filter(Boolean).pop() || tag(e, 'id'),
      title: tag(e, 'title'),
      url: link,
      feed,
      category: (e.match(/<category[^>]*term="([^"]+)"/) || [])[1] || (feed === 'topics' ? 'Topics' : ''),
      published: tag(e, 'published') || tag(e, 'updated'),
      text,
    });
  }
  return out;
}

// ---------- Date extraction ----------
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const TIME = '(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)';
const DT_RE = new RegExp(`(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\\s+)?${MON}\\s+(\\d{1,2}),?\\s+(\\d{4})(?:,?\\s*(?:at\\s+)?${TIME})?`, 'gi');
const TIME_RE = new RegExp(`\\b${TIME}`, 'gi');
const MONTH_ONLY_RE = new RegExp(`\\b${MON}\\s+(\\d{4})\\b`, 'gi');
const ZONES = { PST: -8, PDT: -7, EST: -5, EDT: -4, GMT: 0, UTC: 0, BST: 1, CET: 1, CEST: 2, JST: 9, AEDT: 11, AEST: 10 };
const ZONE_RE = /\((PST|PDT|EST|EDT|GMT|UTC|BST|CET|CEST|JST|AEDT|AEST)\)/;

const monthIdx = m => MONTHS.indexOf(m.slice(0, 3).toLowerCase());
function to24(h, ampm) { h = +h % 12; return /p/i.test(ampm) ? h + 12 : h; }
function iso(y, mo, d, h, mi, zone) { return new Date(Date.UTC(y, mo, d, h - (ZONES[zone] ?? -8), mi)).toISOString(); }
function zoneAfter(text, i, fallback) { const m = text.slice(i, i + 60).match(ZONE_RE); return m ? m[1] : fallback; }

export function extractWindows(text) {
  const defaultZone = (text.match(ZONE_RE) || [, 'PST'])[1];
  // Full dates first, then bare times not inside a full date.
  const toks = [];
  for (const m of text.matchAll(DT_RE)) {
    const [, mon, d, y, hh, mm, ap] = m;
    toks.push({ kind: 'dt', i: m.index, end: m.index + m[0].length, y: +y, mo: monthIdx(mon), d: +d,
      h: hh ? to24(hh, ap) : null, mi: hh ? +mm : 0 });
  }
  const inDt = i => toks.some(t => t.kind === 'dt' && i >= t.i && i < t.end);
  for (const m of text.matchAll(TIME_RE)) {
    if (!inDt(m.index)) toks.push({ kind: 't', i: m.index, end: m.index + m[0].length, h: to24(m[1], m[3]), mi: +m[2] });
  }
  toks.sort((a, b) => a.i - b.i);

  const windows = [];
  const used = new Set();
  for (let k = 0; k < toks.length; k++) {
    const a = toks[k];
    if (a.kind !== 'dt' || used.has(k)) continue;
    const zone = zoneAfter(text, a.end, defaultZone);
    const start = iso(a.y, a.mo, a.d, a.h ?? 0, a.mi, zone);
    let end = null;
    const b = toks[k + 1];
    if (b) {
      const between = text.slice(a.end, b.i);
      if (/^\s*(\([A-Z]{2,4}\))?\s*(to|and|until|through|-|–|—|~)\s*$/i.test(between)) {
        const ez = zoneAfter(text, b.end, zone);
        end = b.kind === 'dt' ? iso(b.y, b.mo, b.d, b.h ?? 23, b.h == null ? 59 : b.mi, ez)
                              : iso(a.y, a.mo, a.d, b.h, b.mi, ez);
        used.add(k + 1);
      }
    }
    windows.push({ start, end, allDay: a.h == null, approx: false, text: text.slice(a.i, (b && used.has(k + 1) ? b.end : a.end)).trim() + ` (${zone})` });
  }
  if (!windows.length) {
    // Month-only announcements such as "January 2027": keep, flagged as approximate.
    for (const m of text.matchAll(MONTH_ONLY_RE)) {
      const mo = monthIdx(m[1]), y = +m[2];
      windows.push({ start: new Date(Date.UTC(y, mo, 1)).toISOString(), end: new Date(Date.UTC(y, mo + 1, 0, 23, 59)).toISOString(),
        allDay: true, approx: true, text: m[0] });
    }
  }
  // De-duplicate (articles often repeat the same period).
  const seen = new Set();
  return windows.filter(w => { const key = w.start + '|' + w.end; if (seen.has(key)) return false; seen.add(key); return true; });
}

// ---------- Merge and save ----------
async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; } }

async function main() {
  const args = process.argv.slice(2);
  const sources = {};
  for (let i = 0; i < args.length; i++) if (args[i] === '--file') { const [p, f] = args[++i].split(':'); sources[f] = await readFile(p, 'utf8'); }
  if (!Object.keys(sources).length) {
    for (const [feed, url] of Object.entries(FEEDS)) {
      const res = await fetch(url, { headers: { 'User-Agent': 'lodestone-sync (wallpaper calendar)' } });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      sources[feed] = await res.text();
    }
  }

  const now = new Date().toISOString();
  const db = await readJson(OUT, { events: [] });
  const byId = new Map(db.events.map(e => [e.id, e]));
  let added = 0, updated = 0;
  for (const [feed, xml] of Object.entries(sources)) {
    for (const entry of parseFeed(xml, feed)) {
      const windows = extractWindows(entry.text);
      if (!windows.length) continue;
      const prev = byId.get(entry.id);
      const { text, ...meta } = entry;
      byId.set(entry.id, { ...meta, windows, firstSeen: prev?.firstSeen || now, lastSeen: now });
      prev ? updated++ : added++;
    }
  }
  const manual = (await readJson(MANUAL, { events: [] })).events.map(e => ({ ...e, feed: 'manual' }));
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  const events = [...byId.values()].filter(e => e.feed !== 'manual')
    .filter(e => e.windows.some(w => Date.parse(w.end || w.start) >= cutoff));
  const all = [...events, ...manual].sort((a, b) => a.windows[0].start.localeCompare(b.windows[0].start));

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ generated: now, region: REGION, events: all }, null, 2) + '\n');
  console.log(`events.json: ${all.length} events (${added} new, ${updated} refreshed, ${manual.length} manual)`);
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) main().catch(e => { console.error(e); process.exit(1); });
