# Predict2U v269 — Enhancements and behaviour

## New fourth Team Intelligence tab
`Daily Auto Picks` appears immediately after `Matchup Lab`.

## Why it was added
The Matchup Lab is useful when a user already knows which two profiles to compare. Daily Auto Picks removes that manual step. It scans every fixture for all qualifying home and away profiles and runs the same matchup analysis automatically.

## Behaviour
- Uses the global Team Intelligence date filter.
- Requires at least eight relevant split matches for both teams.
- Detects every qualifying profile for each team.
- Tests up to the five strongest home profiles against the five strongest away profiles.
- Requires a minimum 80% model-strength result.
- Requires the detected profile pair to directly support the published market, so unrelated profile labels are never shown as evidence.
- Rejects automatic picks priced below 1.15 to avoid publishing near-zero-return selections.
- Rejects markets when the top two outcomes are too close.
- Publishes only one market per fixture.
- Shows No Bet rather than forcing a selection.
- Groups selections by fixture date.
- Allows filtering by league, market group and search.
- `Open in Matchup Lab` reproduces the profile pair and full analysis for that card.

## What users should expect
Some dates may have few or zero selections. That is expected when split samples, profile quality, odds or market separation are insufficient.
