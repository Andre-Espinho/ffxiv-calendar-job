// Makes worker/dist/worker.js: one self-contained file to paste into the Cloudflare dashboard editor.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const lib = (await readFile(new URL('../scripts/lib/character-parse.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
const w = (await readFile(new URL('./index.mjs', import.meta.url), 'utf8')).replace(/^import .*\n/m, '');
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(new URL('./dist/worker.js', import.meta.url),
  '// Built from worker/index.mjs and scripts/lib/character-parse.mjs. Regenerate with: node worker/build.mjs\n' + lib + '\n' + w);
console.log('worker/dist/worker.js written');
