// Cloudflare Worker: a small read-only relay for Lodestone character pages, so the wallpaper
// (a web page) is allowed to read them. It only forwards the few character pages the player card
// needs, caches each for an hour, and does no parsing, so it stays far below the free plan's CPU limit.
//
//   GET /lodestone/character/<id>/                       profile
//   GET /lodestone/character/<id>/{mount,minion,achievement,class_job}/
//   GET /lodestone/character/<id>/equipment/tooltip/<n>  one gear tooltip
//   GET /lodestone/character/<id>/achievement/kind/<n>/?page=<p>   achievements of one kind (relic hunter card)

const CACHE_SECONDS = 3600;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const ALLOWED = /^\/lodestone\/character\/\d{1,12}\/(?:(?:mount|minion|achievement|class_job)\/|achievement\/kind\/\d{1,2}\/|equipment\/tooltip\/\d{1,2})?$/;
const reply = (body, status, type = 'application/json; charset=utf-8', extra = {}) =>
  new Response(body, { status, headers: { 'Content-Type': type, ...CORS, ...extra } });

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === '/') return reply('{"ok":true,"usage":"/lodestone/character/<id>/"}', 200);
    if (request.method !== 'GET' || !ALLOWED.test(url.pathname)) return reply('{"error":"Not an allowed Lodestone character page"}', 404);

    // only ?page=<n> is passed on (achievement lists are 50 per page); anything else in the query is dropped
    const page = /^\d{1,3}$/.test(url.searchParams.get('page') || '') ? `?page=${url.searchParams.get('page')}` : '';
    const key = new Request(url.origin + url.pathname + page);
    const cached = await caches.default.match(key);
    if (cached) return cached;

    const region = (env && env.LODESTONE_REGION) || 'na';
    const headers = { 'User-Agent': 'lodestone-relay (wallpaper player card)' };
    if (url.pathname.includes('/tooltip/')) headers['X-Requested-With'] = 'XMLHttpRequest';
    const up = await fetch(`https://${region}.finalfantasyxiv.com${url.pathname}${page}`, { headers });
    if (!up.ok) return reply(JSON.stringify({ error: `Lodestone returned ${up.status}` }), up.status === 404 ? 404 : 502);

    const res = reply(await up.text(), 200, 'text/html; charset=utf-8', { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
  },
};
