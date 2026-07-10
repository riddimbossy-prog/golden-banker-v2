# PurePPG Engine Family

This package contains eight progressively stronger engines:

| Version | Engine | Main upgrade |
|---:|---|---|
| 1 | Normal | Baseline Effective PPG and market scoring |
| 2 | Strict | Higher thresholds and reduced volume |
| 3 | Ultra | Recent-ten and league normalization |
| 4 | Elite | Bayesian shrinkage, opponent adjustment, volatility |
| 5 | Apex | Uncertainty intervals and Conservative Edge |
| 6 | Prime | Market calibration and league reliability |
| 7 | Expert | Context, similar opponents, rest and split stability |
| 8 | Pro | Seven-engine consensus and maximum abstention |

## Strength progression

`Normal → Strict → Ultra → Elite → Apex → Prime → Expert → Pro`

Each engine inherits the previous engine unless it explicitly replaces a rule. Pro runs all seven earlier engines internally.

## Specialist engines

Trend, Streaks, Halves, Mismatch, and Value remain separate specialist engines and are not part of this version ladder.

## Implementation note

These are statistical-analysis specifications. Outputs must never be presented as guaranteed outcomes.
