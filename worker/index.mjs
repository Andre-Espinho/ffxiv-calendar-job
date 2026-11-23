// Cloudflare Worker: GET /character/<id> returns that Lodestone character as JSON for the wallpaper.
// Open CORS so a web wallpaper can read it; each character is cached for an hour.
import { fetchCharacter } from '../scripts/lib/character-parse.mjs';

const CACHE_SECONDS = 3600;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '') return json({ ok: true, usage: '/character/<id>' });
    const m = url.pathname.match(/^\/character\/(\d{1,12})\/?$/);
    if (request.method !== 'GET' || !m) return json({ error: 'Use /character/<id>' }, 404);

    const key = new Request(`${url.origin}/character/${m[1]}`);
    const cached = await caches.default.match(key);
    if (cached) return cached;

    const region = (env && env.LODESTONE_REGION) || 'na';
    const get = async (u, headers = {}) => {
      const r = await fetch(u, { headers: { 'User-Agent': 'lodestone-relay (wallpaper player card)', ...headers } });
      return r.ok ? r.text() : null;
    };
    let c;
    try { c = await fetchCharacter(m[1], get, region); }
    catch (e) { return json({ error: 'Lodestone could not be read' }, 502); }
    if (!c) return json({ error: 'Character not found or profile is private' }, 404);
    c.fetched = new Date().toISOString();

    const res = json(c, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
  },
};
