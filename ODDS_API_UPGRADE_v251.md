# Predict2U Odds Intelligence Upgrade v251

## Purpose

This build connects the GitHub secret `ODDS_API_KEY` to the production fixture pipeline and uses the paid Odds API as a secondary market source.

API-Football remains the primary fixture/statistics source. The Odds API fills missing prices, supplies multi-book consensus and attempts the provider's first-half, second-half and HT/FT combination markets.

## What is added

- Missing 1X2, totals, BTTS, Draw No Bet and Double Chance prices.
- First-half and second-half 1X2/goal markets when the provider supports them.
- Actual HT/FT combination prices when exposed by the provider.
- A clearly labelled derived HT/FT direction signal when only separate half-time and full-time prices are available. Derived signals are never shown as bookmaker odds.
- Bookmaker count, median price, minimum/maximum, dispersion, timestamp and source metadata.
- Cross-market agreement scoring.
- A shared odds guard across all 20 engines.
- Odds Intelligence Engine v2.0 with current multi-book consensus fallback when opening prices are unavailable.

## Engine protection rules

1. Odds cannot create a pick by themselves.
2. Missing odds add no confidence.
3. Tight four-plus-book agreement may add a small confirmation bonus.
4. Strong multi-book contradiction removes banker status and may convert the selection to No Bet.
5. Wide bookmaker dispersion is treated as market uncertainty.
6. Actual HT/FT prices may confirm a full-time direction.
7. Derived HT/FT signals are informational and receive less weight than real prices.

## Workflows

### Predict2U Fast All Games

The existing workflow now runs `enrich-odds-api.js` after all fixture shards are merged and before model reports are rebuilt.

### Predict2U Odds + HTFT Refresh

A new manual workflow refreshes odds on the existing board without rerunning all six data-enrichment shards.

Run it from:

`Actions → Predict2U Odds + HTFT Refresh → Run workflow`

## Generated report

`odds-api-coverage.json` records:

- matched and unmatched fixtures
- fields filled and reconciled
- bookmaker rows
- actual HT/FT coverage
- derived HT/FT signals
- unsupported market keys
- API request errors
- remaining quota headers when supplied by the provider

## Cost controls

- Paid responses are cached in `odds-api-cache.json` through GitHub Actions Cache.
- The cache is ignored by Git and is never published.
- Advanced half/HTFT market capability is probed once per sport and reused.
- Advanced event lookups are capped at 120 fixtures per run by default.
- The regular paid enrichment runs only inside the merge job, not in all six shards.

## Required GitHub secret

`ODDS_API_KEY`

No other new secret is required.
