// Fetches Lodestone character profiles listed in characters.txt (one ID per line)
// and writes data/characters/<id>.json for the wallpaper's player card. No dependencies, Node 20+.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchCharacter as fetchWith } from './lib/character-parse.mjs';

const REGION = process.env.LODESTONE_REGION || 'na';
const UA = { 'User-Agent': 'lodestone-sync (wallpaper player card)' };
const pause = ms => new Promise(r => setTimeout(r, ms));
async function get(url, extra = {}) {
  await pause(250);                                   // be gentle with the Lodestone
  const r = await fetch(url, { headers: { ...UA, ...extra } });
  return r.ok ? r.text() : null;
}

async function main() {
  const ids = (await readFile('characters.txt', 'utf8').catch(() => '')).split(/\s+/).filter(l => /^\d+$/.test(l));
  await mkdir('data/characters', { recursive: true });
  for (const id of ids) {
    const c = await fetchWith(id, get, REGION);
    if (!c) { console.error(`${id}: could not read the profile`); continue; }
    const path = `data/characters/${id}.json`;
    const prev = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
    const same = JSON.stringify({ ...prev, fetched: 0, parseMs: 0 }) === JSON.stringify({ ...c, fetched: 0, parseMs: 0 });
    if (!same) await writeFile(path, JSON.stringify(c, null, 2) + '\n');
    console.log(`${id}: ${c.name} | ${c.activeJob} ${c.activeLevel} | iLvl ${c.itemLevel} (${c.gear.length} items) | ` +
      `${c.achievements?.points} pts / ${c.achievements?.count} | ${c.mounts} mounts, ${c.minions} minions | ` +
      `${c.special.map(s => s.name + ' ' + s.level).join(', ')} | attrs ${Object.keys(c.attributes).length}${same ? ' | unchanged' : ''} | parse ${c.parseMs} ms`);
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main().catch(e => { console.error(e); process.exit(1); });
