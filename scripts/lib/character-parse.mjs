// Parses Lodestone character pages. Shared by the GitHub job and (later) a Cloudflare Worker.
// Pure JavaScript: no Node or browser APIs.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const text = s => decode((s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
// inner HTML of the first element whose class list contains `cls`
function inner(html, cls, from = 0) {
  const re = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'g');
  re.lastIndex = from;
  const m = re.exec(html); if (!m) return null;
  const tag = m[1], start = m.index + m[0].length;
  let depth = 1, i = start; const t = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'g'); t.lastIndex = start;
  for (let x; (x = t.exec(html));) { if (x[2]) continue; depth += x[1] ? -1 : 1; if (!depth) return html.slice(start, x.index); }
  return html.slice(start);
}
const all = (html, cls) => { const out = []; const re = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'g'); let m;
  while ((m = re.exec(html))) out.push(inner(html, cls, m.index - 30 < 0 ? 0 : html.lastIndexOf('<', m.index))); return out; };
const src = h => (h && (h.match(/<img[^>]*src="([^"]+)"/) || [])[1]) || null;

export function parseCharacter(html, id, REGION = 'na') {
  const blocks = all(html, 'character-block__box').map(b => ({
    title: text(inner(b, 'character-block__title')), name: text(inner(b, 'character-block__name') || inner(b, 'character-block__profile') || '') }));
  const block = re => (blocks.find(b => re.test(b.title)) || {}).name || null;
  const levels = [];
  for (const li of all(html, 'character__level__list').flatMap(l => (l || '').split(/<li\b/).slice(1))) {
    const job = (li.match(/data-tooltip="([^"]+)"/) || [])[1];
    const lv = text(li.replace(/<img[^>]*>/g, '')).replace(/[^\d-]/g, '');
    if (job) levels.push({ job: decode(job).split(' / ')[0].trim(), level: lv && lv !== '-' ? +lv : 0 });
  }
  // active job: the main-hand item's category ("Dancer's Arm"), else the soul crystal, else a matching job icon
  const cat = (html.match(/db-tooltip__item__category[^>]*>([^<]+?)(?:'s|’s) (?:Arm|Primary Tool|Grimoire)/) || [])[1];
  const soulM = (html.match(/Soul of the ([A-Z][a-zA-Z ]+?)</) || [])[1];
  const iconSrc = src(inner(html, 'character__class_icon'));
  let iconJob = null;
  if (iconSrc) { const m = html.match(new RegExp(`data-tooltip="([^"]+)"[^>]*src="${iconSrc.replace(/[.?*+^$()[\]{}|\\]/g, '\\$&')}"|src="${iconSrc.replace(/[.?*+^$()[\]{}|\\]/g, '\\$&')}"[^>]*data-tooltip="([^"]+)"`));
    if (m) iconJob = decode(m[1] || m[2]).split(' / ')[0].trim(); }
  const soul = (cat && decode(cat).trim()) || soulM || iconJob || null;
  if (typeof process !== 'undefined' && process.env && process.env.DEBUG_CHAR) console.log('debug', { cat, soulM, iconSrc, iconJob,
    around: html.slice(Math.max(0, html.indexOf('character__class')), html.indexOf('character__class') + 600) });
  const activeLevel = +(text(inner(html, 'character__class__data') || '').match(/\d+/) || [0])[0] || null;
  const portrait = src(inner(html, 'character__detail__image')) || (html.match(/https:\/\/img2\.finalfantasyxiv\.com\/f\/[^"]+fl0\.jpg[^"]*/) || [])[0] || null;
  const face = src(inner(html, 'frame__chara__face')) || (html.match(/https:\/\/img2\.finalfantasyxiv\.com\/f\/[^"]+fc0\.jpg[^"]*/) || [])[0] || null;
  return {
    id: String(id),
    url: `https://${REGION}.finalfantasyxiv.com/lodestone/character/${id}/`,
    name: text(inner(html, 'frame__chara__name')),
    title: text(inner(html, 'frame__chara__title')) || null,
    world: text(inner(html, 'frame__chara__world')).replace(/\s+/g, ' ') || null,
    raceClanGender: block(/Race/i),
    nameday: text(inner(html, 'character-block__birth')) || null,
    cityState: block(/City-state/i),
    grandCompany: block(/Grand Company/i),
    freeCompany: text(inner(html, 'character__freecompany__name') || '').replace(/^Free Company\s*/i, '') || null,
    activeJob: soul, activeLevel,
    portrait, face, levels,
    fetched: new Date().toISOString(),
  };
}


// ---- extra pages ----
const num = s => s == null ? null : +String(s).replace(/[^\d]/g, '') || 0;
export const totalFrom = html => num((html.match(/sort__total">\s*Total:\s*<span>([\d,]+)<\/span>/) || [])[1]);
export function parseAchievements(html) {
  return { points: num((html.match(/class="achievement__point">([\d,]+)</) || [])[1]),
           count: num((html.match(/class="parts__total">([\d,]+) Total/) || [])[1]) };
}
// Eureka, Bozja, Occult Crescent and similar: level blocks on the class/job page whose name isn't a job
export function parseSpecialLevels(html, jobNames) {
  const out = [];
  const re = /character__job__level">([\d-]+)<\/div>\s*<div class="character__job__name[^"]*"[^>]*>([^<]+)<\/div>/g;
  for (let m; (m = re.exec(html));) {
    const name = decode(m[2]).trim();
    if (jobNames.has(name) || !/Level|Rank/.test(name)) continue;    // jobs (incl. limited jobs) are in levels already
    const head = html.slice(0, m.index).match(/<h3 class="heading--md">([^<]+)<\/h3>(?![\s\S]*<h3 class="heading--md">)/);
    out.push({ area: head ? decode(head[1]).trim() : null, name, level: m[1] === '-' ? 0 : +m[1] });
  }
  return out;
}
// one equipment tooltip -> { name, category, itemLevel }
export function parseTooltip(html) {
  return { name: text((html.match(/db-tooltip__item__name[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || ''),
           category: text((html.match(/db-tooltip__item__category[^>]*>([^<]*)</) || [])[1] || ''),
           itemLevel: num((html.match(/Item Level (\d+)/) || [])[1]) };
}
// average item level the way the game shows it: 12 slots, soul crystal excluded,
// a two-handed weapon (no off-hand) counts twice
export function averageItemLevel(items) {
  const gear = items.filter(i => i && i.itemLevel && !/Soul Crystal/i.test(i.category));
  if (gear.length < 6) return null;
  const sum = gear.reduce((a, i) => a + i.itemLevel, 0) + (gear.length === 11 ? gear[0].itemLevel : 0);
  return Math.floor(sum / 12);
}
// attributes table: { Strength: 438, ... }
export function parseAttributes(html) {
  const out = {};
  const re = /<th>(?:<span[^>]*>)?([^<]+)(?:<\/span>)?<\/th>\s*<td>([\d,]+)<\/td>/g;
  for (let m; (m = re.exec(html));) out[decode(m[1]).trim()] = num(m[2]);
  const hp = html.match(/character__param__text__hp--en-us">HP<\/p><span>([\d,]+)</); if (hp) out.HP = num(hp[1]);
  const mp = html.match(/character__param__text__mp--en-us">MP<\/p><span>([\d,]+)</); if (mp) out.MP = num(mp[1]);
  return out;
}

// Fetches every page the player card needs. `get(url, headers)` returns the page text or null,
// so the GitHub job and the Worker can each supply their own fetching.
export async function fetchCharacter(id, get, REGION = 'na') {
  const base = `https://${REGION}.finalfantasyxiv.com/lodestone/character/${id}`;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let parseMs = 0; const timed = f => { const t = now(); const r = f(); parseMs += now() - t; return r; };
  const html = await get(base + '/');
  if (!html) return null;
  const c = timed(() => parseCharacter(html, id, REGION));
  if (!c.name) return null;
  const slots = timed(() => [...new Set([...html.matchAll(/equipment\/tooltip\/(\d+)/g)].map(m => +m[1]))].sort((a, b) => a - b));
  const xhr = { 'X-Requested-With': 'XMLHttpRequest' };
  const [tips, mounts, minions, ach, cj] = await Promise.all([
    Promise.all(slots.map(n => get(`${base}/equipment/tooltip/${n}`, xhr))),
    get(base + '/mount/'), get(base + '/minion/'), get(base + '/achievement/'), get(base + '/class_job/')]);
  timed(() => {
    c.gear = tips.filter(Boolean).map(parseTooltip);
    c.itemLevel = averageItemLevel(c.gear);
    c.attributes = parseAttributes(html);
    c.mounts = mounts ? totalFrom(mounts) : null;
    c.minions = minions ? totalFrom(minions) : null;
    c.achievements = ach ? parseAchievements(ach) : null;
    c.special = cj ? parseSpecialLevels(cj, new Set(c.levels.map(l => l.job))) : [];
    c.gcRank = c.grandCompany ? c.grandCompany.split(' / ')[1] || null : null;
  });
  c.parseMs = Math.round(parseMs * 10) / 10;
  return c;
}
