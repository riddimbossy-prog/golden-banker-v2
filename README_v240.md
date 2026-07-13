# Predict2U Fast All-Games Pipeline v240

This replaces the single long fixture job with a three-stage pipeline:

1. **Discover** every fixture in the seven-day window using date-wide API calls.
2. **Enrich** active leagues in six balanced GitHub Action jobs running in parallel.
3. **Merge** all results, run Stats API/model reports once, verify, and publish.

## Why it is faster

- The league range response is reused instead of making seven extra date calls per league.
- Six balanced shards run at the same time.
- H2H, standings, team statistics and historical trend responses are cached between runs.
- Calibration, xG enrichment and model reports run once after merging—not six times.
- No active league is dropped because of `MAX_LEAGUES` or `MAX_PROBES` caps.

## Replace/add these files

- Replace `fetch-data.js`
- Replace `.github/workflows/future-fixtures.yml`
- Add `discover-all-games.js`
- Add `merge-fixture-shards.js`
- Add `rebuild-derived-data.js`

Keep your existing secrets. `DAYS_FWD` remains `6`; `ODDS` and `H2H` can remain `true`.

## Expected timing

The first uncached run can still be substantial because every game receives H2H, odds and team-stat processing. Six parallel shards should reduce wall-clock time dramatically compared with one serial job. Later runs are faster because historical responses are served from `api-cache.json`.

Do not run the old and new future-fixture workflows together. Replace the old `future-fixtures.yml` with this one.
