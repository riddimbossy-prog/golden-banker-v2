# Predict2U Live Scores v151

## What this fixes

The previous pages checked whether `homeGoals` was null before showing LIVE.
Once a live game had a real score such as 0–0 or 1–0, `homeGoals` was no longer
null, so the LIVE badge disappeared even though the match was still in play.

v151 checks the fixture status first.

Live status codes:

- `1H`
- `HT`
- `2H`
- `ET`
- `BT`
- `P`
- `LIVE`

## Current score data stored

`fetch-scores.js` now writes:

```js
homeGoals
awayGoals
status
statusLong
elapsed
elapsedExtra
liveUpdatedAt
htHome
htAway
```

Examples displayed:

- `LIVE · 34'`
- `LIVE · 45+2'`
- `LIVE · HT`
- `LIVE · 90+5'`
- `LIVE · EXTRA TIME`
- `LIVE · PENALTIES`

## Pages updated

- `board.html`
- `engines.html`
- `proof.html`

Live fixtures display:

- Current home and away score
- Current match minute
- Halftime/break/extra-time status
- Pulsing LIVE indicator
- No premature Won/Lost settlement while the match remains live

## Automatic browser refresh

`live-refresh.js` checks `data.js` every 60 seconds during the active match
window. When a newer `SCORES_UPDATED` timestamp appears, the page reloads.

This does not call API-Football from the browser and does not expose the API key.

## GitHub Actions

Add:

```text
.github/workflows/live-scores.yml
```

The workflow requests a fresh score snapshot every five minutes and commits only
when data changed.

Required repository secret:

```text
API_FOOTBALL_KEY
```

GitHub schedule timing is approximate. Depending on Actions queueing and Pages
deployment, public scores may normally trail the provider by about 5–10 minutes.
This is a current-snapshot system, not second-by-second streaming.

## Files to add

- `live-refresh.js`
- `.github/workflows/live-scores.yml`

## Files to replace

- `fetch-scores.js`
- `p2u-intelligence.js`
- `board.html`
- `engines.html`
- `proof.html`
- `sw.js`

Cache version: `predict2u-v151`.
