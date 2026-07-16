# Predict2U v254 — Fast All Games discovery rate-limit fix

## Why run #21 failed
The `Discover every active league` job made several date requests at once and also tried extra season variants when a date returned zero fixtures. API-Football stopped the job with its requests-per-minute limit.

## Replace these files
- `discover-all-games.js`
- `.github/workflows/future-fixtures.yml`

## What changed
- One date request at a time.
- Exactly one endpoint per date.
- 13-second minimum gap between requests.
- API-Football HTTP-200 rate-limit messages are detected.
- The job waits 70 seconds and retries automatically.
- Existing `fixtures.js` and `data.js` rows protect a date if the provider remains temporarily unavailable.
- Discovery still creates the same three artifacts expected by the six enrichment shards.

## Run
Commit and push the two replacements. Start a new **Predict2U Fast All Games** run from the Actions tab. Do not re-run failed job #21 because it uses the old workflow revision.

The discovery job will now take roughly 2–5 minutes before the six enrichment shards begin. That slower discovery is intentional and protects the API subscription.
