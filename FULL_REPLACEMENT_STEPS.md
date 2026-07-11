# Predict2U Full Replacement v163

This ZIP is the complete clean repository replacement through v162, packaged as v163.

## Included
- Complete public website and homepage
- 16-engine suite and specialist engines
- Proof Mode, Scorecards, League DNA, Trust Center and legal pages
- Live-score display and refresh system
- Brand assets, favicon set, manifest, social preview, robots and sitemap
- Advanced-data pipeline, xG, SOT and calibration scripts
- GitHub Actions workflows
- Repository audit, preflight and Playwright responsive tests
- Mobile, tablet and Galaxy Z Fold fixes

## Intentionally not included
- API keys or `config.txt`
- `node_modules`
- Playwright test results/reports
- A stale `data.js`
- Private generated ledgers such as `track-log.json`

## Safest replacement method
1. Clone a fresh copy of `riddimbossy-prog/golden-banker-v2`.
2. Extract this ZIP.
3. Open the inner `Predict2U_FULL_REPLACEMENT_v163` folder.
4. Copy everything inside it into the freshly cloned repository folder.
5. Choose **Replace files in destination**.
6. Do not delete an existing fresh `data.js`, `track-log.json`, `team-profiles.json`, or other generated ledgers from GitHub. This package does not contain them, so copying over the clone will leave them intact.
7. Commit all changes as `Install complete Predict2U v163 replacement`.
8. Push origin.
9. Run a new `Predict2U Site Quality` workflow.
10. Run the normal full-data workflow once after deployment.

## Required GitHub secret
- `API_FOOTBALL_KEY`

Optional:
- `STATS_API_KEY`

## Important
Copy the contents over a fresh clone. Do not extract this ZIP into the old damaged Git folder.
