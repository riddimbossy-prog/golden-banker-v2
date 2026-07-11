# Predict2U New Engine Family v147

This package replaces the previous engine implementations with the two supplied engine families.

## Deployment files

Replace these files in the repository root:

- `banker-engine.js`
- `board.html`
- `engines.html`
- `sw.js`

`backfill-odds.js` is included unchanged as the historical-odds calibration tool.

## Active engine list

### PurePPG ladder

1. Normal v1.0
2. Strict v2.0
3. Ultra v3.0
4. Elite v4.0
5. Apex v5.0
6. Prime v6.0
7. Expert v7.0
8. Pro v8.0

### Specialist family

9. Trend v1.0
10. Streaks v1.0
11. Mismatch v1.0
12. Halves v1.0
13. League Bias v1.0
14. Momentum v1.0
15. Odds Intelligence v1.0
16. Value v1.0

The Pro Consensus Integration is exposed as `proConsensusRecommend()` but is not counted as a seventeenth engine because the supplied architecture defines it as an integration layer.

## Compatibility

Old page function names remain available:

- `rulesProRecommend` now points to PurePPG Elite v4.0.
- `indicatorRecommend` now points to Odds Intelligence v1.0.
- All existing `recommend`, `strictRecommend`, `settle`, and slip/page contracts remain available.

## Important data rule

The new specifications explicitly forbid inventing mandatory data. Therefore Ultra and stronger engines, Momentum, Odds Intelligence and Value may correctly return `No Bet` until their required fields are added. See `DATA_READINESS.md`.

## Cache

The service worker is bumped to `predict2u-v147` so existing phones do not keep the old engine file.


## v148 repository integration

See `ENGINE_INTEGRATION_v148.md` for the updated automation and tracking scripts.


## v149 advanced data

See `ADVANCED_DATA_SETUP_v149.md`.
