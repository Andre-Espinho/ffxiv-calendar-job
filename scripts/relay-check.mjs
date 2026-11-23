// Checks a deployed relay end to end: CORS header, blocked paths, and a full character read
// through the same parser the wallpaper uses. Usage: node scripts/relay-check.mjs <relay-url> [id]
import { fetchCharacter } from './lib/character-parse.mjs';
const relay = (process.argv[2] || '').replace(/\/+$/, ''), id = process.argv[3] || '34035528';
const root = await fetch(relay + '/'); console.log('root', root.status, await root.text());
const blocked = await fetch(relay + '/lodestone/news/'); console.log('blocked path', blocked.status);
const prof = await fetch(`${relay}/lodestone/character/${id}/`, { headers: { Origin: 'file://' } });
console.log('profile', prof.status, 'CORS', prof.headers.get('access-control-allow-origin'), 'bytes', (await prof.text()).length);
const t0 = Date.now(); let n = 0;
const c = await fetchCharacter(id, async u => { n++; const r = await fetch(relay + new URL(u).pathname); return r.ok ? r.text() : null; });
console.log(`full read: ${n} requests in ${Date.now() - t0} ms`);
console.log(c && { name: c.name, job: c.activeJob, level: c.activeLevel, itemLevel: c.itemLevel, gear: c.gear.length, mounts: c.mounts, minions: c.minions, achievements: c.achievements, special: c.special.map(s => `${s.name} ${s.level}`) });
const again = Date.now(); await fetch(`${relay}/lodestone/character/${id}/mount/`); console.log('cached re-fetch', Date.now() - again, 'ms');
if (!c || !c.name) process.exit(1);
