// Temporary: prints what the Lodestone pages contain, to design the parser. Run with an ID.
const id = process.argv[2] || '34035528', base = `https://na.finalfantasyxiv.com/lodestone/character/${id}`;
const pages = { profile: '/', mount: '/mount/', minion: '/minion/', achievement: '/achievement/', classjob: '/class_job/' };
const markers = ['Item Level', 'db-tooltip__item__level', 'character__param', 'character__param__list', 'character-block__name',
  'character__mounts', 'character__minion', 'minion__list', 'mount__list', 'achievement__point', 'parts__total', 'character__selfintroduction',
  'character__freecompany__crest', 'Elemental Level', 'Resistance Rank', 'character__job__level', 'js__db_tooltip', 'heading__toggle', 'equipment/tooltip'];
for (const [k, p] of Object.entries(pages)) {
  const r = await fetch(base + p, { headers: { 'User-Agent': 'lodestone-sync (probe)' } }); const h = await r.text();
  console.log(`\n=== ${k} ${r.status} ${h.length}`);
  for (const m of markers) { const n = h.split(m).length - 1; if (n) { const i = h.indexOf(m); console.log(`${m} x${n}: ${h.slice(Math.max(0, i - 120), i + 260).replace(/\s+/g, ' ')}`); } }
}
const t = await (await fetch(base + '/equipment/tooltip/0', { headers: { 'User-Agent': 'lodestone-sync (probe)', 'X-Requested-With': 'XMLHttpRequest' } })).text();
console.log('\n=== tooltip0', t.length, (t.match(/Item Level[^<]*<[^>]*>?[^<]*/g) || []).slice(0, 3), t.replace(/\s+/g, ' ').slice(0, 600));
