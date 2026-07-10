# Predict2U Specialist Engine Family v1.0

This package contains eight specialist football-analysis engines and one consensus integration layer.

## Engines

| No. | Engine | Core job |
|---:|---|---|
| 1 | Trend | Finds persistent market tendencies across venue, recent, season and league windows |
| 2 | Streaks | Measures active sequences and verifies whether they are supported or fragile |
| 3 | Mismatch | Detects multi-dimensional quality gaps between opponents |
| 4 | Halves | Analyzes first-half and second-half behavior using half-specific data |
| 5 | League Bias | Finds markets structurally favored by a league, then filters suitable teams |
| 6 | Momentum | Measures improvement, decline, acceleration and reversals |
| 7 | Odds Intelligence | Reads normalized prices, movement and cross-market consistency |
| 8 | Value | Compares calibrated model probability with fair market probability |
| 9 | Pro Consensus Integration | Combines the specialist outputs with the PurePPG Pro engine |

## Shared principles

- One engine output equals one candidate market or `No Bet`.
- Every engine evaluates all supported markets before selecting.
- No engine may invent missing statistics.
- Venue splits must remain separate from overall statistics.
- Small samples are penalized or blocked.
- Every selection includes the exact trigger, warnings, data quality and veto status.
- A specialist score is a reliability score, not a guaranteed probability.
- Outputs are intended for statistical analysis and simulation. Never describe a result as certain or guaranteed.

## Shared specialist output contract

```text
ENGINE:
VERSION:
FIXTURE:
CANDIDATE MARKET:
MARKET FAMILY:
DIRECTION:
SPECIALIST SCORE:
DATA QUALITY:
SIGNAL STRENGTH:
EXACT TRIGGERS:
WARNINGS:
VETO: NONE | SOFT | HARD
VETO SCOPE:
COMPATIBLE SAFER MARKETS:
FINAL STATUS: QUALIFIED | WATCHLIST | NO BET
```

See `09_Pro_Consensus_Integration_v1.0.md` for the final consensus rules.
