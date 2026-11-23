# Lodestone event sync

An hourly GitHub Actions job that reads the official Lodestone Atom feeds, extracts the scheduled dates from each article, and keeps them in `data/events.json`. Events stay in the file after they drop off the feeds (pruned 400 days after they end), so the calendar grows over time.

The wallpaper reads:

```
https://raw.githubusercontent.com/<owner>/<repo>/main/data/events.json
```

GitHub serves that URL with cross-origin access allowed, so no proxy is needed.

## Files

- `.github/workflows/sync-lodestone.yml`: the schedule (hourly at :17, plus a manual "Run workflow" button).
- `scripts/sync.mjs`: fetch, parse and merge. No dependencies, Node 20+.
- `data/manual-events.json`: events you add by hand (housing lottery, festivals announced late). Replace the example.
- `data/events.json`: the output (created on the first run).

## Event format

```json
{
  "id": "44d7f515...", "title": "...", "url": "https://...lodestone/topics/detail/...",
  "feed": "topics | news | manual", "category": "Maintenance | Notices | Updates | Status | Topics | Manual",
  "published": "2026-11-11T08:00:00Z", "firstSeen": "...", "lastSeen": "...",
  "windows": [ { "start": "UTC ISO", "end": "UTC ISO or null", "allDay": false, "approx": false, "text": "quoted date text" } ]
}
```

`approx: true` marks month-only dates such as "January 2027". Articles with no parseable date are skipped.

## Test offline

```
node scripts/sync.mjs --file topics.xml:topics --file news.xml:news
```
