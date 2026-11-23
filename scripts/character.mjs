// Fetches Lodestone character profiles listed in characters.txt (one ID per line)
// and writes data/characters/<id>.json for the wallpaper. No dependencies, Node 20+.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const REGION = process.env.LODESTONE_REGION || 'na';
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

export function parseCharacter(html, id) {
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
  if (process.env.DEBUG_CHAR) console.log('debug', { cat, soulM, iconSrc, iconJob,
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

async function main() {
  const ids = (await readFile('characters.txt', 'utf8').catch(() => '')).split(/\s+/).filter(l => /^\d+$/.test(l));
  await mkdir('data/characters', { recursive: true });
  for (const id of ids) {
    const url = `https://${REGION}.finalfantasyxiv.com/lodestone/character/${id}/`;
    const res = await fetch(url, { headers: { 'User-Agent': 'lodestone-sync (wallpaper calendar)' } });
    if (!res.ok) { console.error(`${id}: HTTP ${res.status}`); continue; }
    const c = parseCharacter(await res.text(), id);
    if (!c.name) { console.error(`${id}: could not read the profile`); continue; }
    const path = `data/characters/${id}.json`;
    const prev = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
    const same = JSON.stringify({ ...prev, fetched: 0 }) === JSON.stringify({ ...c, fetched: 0 });
    if (!same) await writeFile(path, JSON.stringify(c, null, 2) + '\n');
    console.log(`${id}: ${c.name} (${c.world}) ${c.activeJob || '?'} ${c.activeLevel || ''}, ${c.levels.length} jobs${same ? ', unchanged' : ''}`);
  }
}
import { realpathSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main().catch(e => { console.error(e); process.exit(1); });
