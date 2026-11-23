// Builds two single files:
//   worker/dist/worker.js            the Worker, to paste into the Cloudflare dashboard editor
//   worker/dist/lodestone-parse.js   the shared parser for the wallpaper (sets window.LodestoneParse)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const rd = p => readFile(new URL(p, import.meta.url), 'utf8');
const lib = await rd('../scripts/lib/character-parse.mjs');
const names = [...lib.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(m => m[1]);
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(new URL('./dist/worker.js', import.meta.url), '// Built from worker/index.mjs. Regenerate with: node worker/build.mjs\n' + await rd('./index.mjs'));
await writeFile(new URL('./dist/lodestone-parse.js', import.meta.url),
  '// Built from scripts/lib/character-parse.mjs. Regenerate with: node worker/build.mjs\n(() => {\n' +
  lib.replace(/^export /gm, '') + `\nwindow.LodestoneParse = { ${names.join(', ')} };\n})();\n`);
console.log('built', names.join(', '));
