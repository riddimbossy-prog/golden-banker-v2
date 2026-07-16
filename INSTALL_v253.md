# Predict2U v253 Fixture Rate-Limit Fix

The failed workflow was caused by API-Sports returning a per-minute rate-limit error inside an HTTP 200 response. The older script retried only HTTP 429/5xx responses, so the job stopped after several date requests.

## Replace these files

- `fetch-fixtures-snapshot.js`
- `verify-fixture-snapshot.js`
- `.github/workflows/fixture-snapshot.yml`

## What changed

- Requests run one at a time.
- A 13-second gap is enforced between date requests.
- Embedded `Too many requests` API errors are retried.
- Rate-limit retries wait about 65 seconds.
- When a date remains temporarily unavailable, the previous successful fixtures for that date are preserved rather than deleted.
- `fixture-snapshot-report.json` records any stale fallback dates.

## Run

Commit and push the three replacements, then start a new **Predict2U Fast Fixture Snapshot** run. Do not use **Re-run failed jobs** on the old run.
