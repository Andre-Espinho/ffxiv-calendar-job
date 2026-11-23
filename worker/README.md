# Lodestone relay (Cloudflare Worker)

Lets the wallpaper load **any** character ID live, without adding it to `characters.txt`.
The Worker only forwards the few Lodestone character pages the player card needs
(profile, mounts, minions, achievements, class/job, gear tooltips), adds the header that
lets a web page read them, and caches each page for an hour. All parsing happens in the
wallpaper, so the Worker uses almost no CPU and fits the free plan.

## Set it up (about 5 minutes, free plan)

1. Sign in or sign up at https://dash.cloudflare.com.
2. Go to **Workers & Pages** and choose **Create** → **Create Worker** (start from "Hello World").
3. Name it `lodestone-relay` and click **Deploy**.
4. Click **Edit code**, delete everything in `worker.js`, paste the whole of
   [`dist/worker.js`](dist/worker.js) from this repo, and click **Deploy**.
5. Open the Worker's URL (it looks like `https://lodestone-relay.<your-name>.workers.dev`).
   You should see `{"ok":true,...}`.
6. In Wallpaper Engine, paste that URL into **Character relay URL**, then type any character ID.

Optional check: `https://lodestone-relay.<your-name>.workers.dev/lodestone/character/34035528/`
should show the profile page's HTML.

## Notes

- Free plan: 100,000 requests a day. One card refresh is about 17 requests (cached for an hour).
- Region: the Worker reads the NA Lodestone. Change `LODESTONE_REGION` in `wrangler.toml` (or a
  dashboard variable) to `eu`, `fr`, `de` or `jp` if you prefer.
- If you change `index.mjs` or the parser, run `node worker/build.mjs` to rebuild `dist/`.
- With the Wrangler CLI instead of the dashboard: `cd worker && npx wrangler deploy`.
