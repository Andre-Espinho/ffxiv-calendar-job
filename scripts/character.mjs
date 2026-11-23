// Fetches Lodestone character profiles listed in characters.txt (one ID per line)
// and writes data/characters/<id>.json for the wallpaper's player card. No dependencies, Node 20+.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCharacter, totalFrom, parseAchievements, parseSpecialLevels, parseTooltip, averageItemLevel, parseAttributes } from './lib/character-parse.mjs';

const REGION = process.env.LODESTONE_REGION || 'na';
const UA = { 'User-Agent': 'lodestone-sync (wallpaper player card)' };
const pause = ms => new Promise(r => setTimeout(r, ms));
async function get(url, extra = {}) {
  await pause(250);                                   // be gentle with the Lodestone
  const r = await fetch(url, { headers: { ...UA, ...extra } });
  return r.ok ? r.text() : null;
}

export async function fetchCharacter(id) {
  const base = `https://${REGION}.finalfantasyxiv.com/lodestone/character/${id}`;
  const html = await get(base + '/');
  if (!html) return null;
  const c = parseCharacter(html, id, REGION);
  if (!c.name) return null;
  // gear: one tooltip per equipped slot
  const slots = [...new Set([...html.matchAll(/equipment\/tooltip\/(\d+)/g)].map(m => +m[1]))].sort((a, b) => a - b);
  const gear = [];
  for (const n of slots) { const t = await get(`${base}/equipment/tooltip/${n}`, { 'X-Requested-With': 'XMLHttpRequest' }); if (t) gear.push(parseTooltip(t)); }
  c.gear = gear;
  c.itemLevel = averageItemLevel(gear);
  c.attributes = parseAttributes(html);
  const [mounts, minions, ach, cj] = [await get(base + '/mount/'), await get(base + '/minion/'), await get(base + '/achievement/'), await get(base + '/class_job/')];
  c.mounts = mounts ? totalFrom(mounts) : null;
  c.minions = minions ? totalFrom(minions) : null;
  c.achievements = ach ? parseAchievements(ach) : null;
  c.special = cj ? parseSpecialLevels(cj, new Set(c.levels.map(l => l.job))) : [];
  c.gcRank = c.grandCompany ? c.grandCompany.split(' / ')[1] || null : null;
  return c;
}

async function main() {
  const ids = (await readFile('characters.txt', 'utf8').catch(() => '')).split(/\s+/).filter(l => /^\d+$/.test(l));
  await mkdir('data/characters', { recursive: true });
  for (const id of ids) {
    const c = await fetchCharacter(id);
    if (!c) { console.error(`${id}: could not read the profile`); continue; }
    const path = `data/characters/${id}.json`;
    const prev = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
    const same = JSON.stringify({ ...prev, fetched: 0 }) === JSON.stringify({ ...c, fetched: 0 });
    if (!same) await writeFile(path, JSON.stringify(c, null, 2) + '\n');
    console.log(`${id}: ${c.name} | ${c.activeJob} ${c.activeLevel} | iLvl ${c.itemLevel} (${c.gear.length} items) | ` +
      `${c.achievements?.points} pts / ${c.achievements?.count} | ${c.mounts} mounts, ${c.minions} minions | ` +
      `${c.special.map(s => s.name + ' ' + s.level).join(', ')} | attrs ${Object.keys(c.attributes).length}${same ? ' | unchanged' : ''}`);
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main().catch(e => { console.error(e); process.exit(1); });
