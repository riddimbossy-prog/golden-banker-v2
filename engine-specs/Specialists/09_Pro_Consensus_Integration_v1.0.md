# Predict2U Pro Consensus Integration v1.0
## PurePPG Pro + Specialist Engine Decision Layer

## 1. Objective

The consensus layer combines:

- PurePPG Pro
- Trend
- Streaks
- Mismatch
- Halves
- League Bias
- Momentum
- Odds Intelligence
- Value

It outputs one final market or:

```text
No Bet — consensus requirements not met
```

No simple average is allowed.

## 2. Domain ownership

Certain markets require the relevant specialist:

| Market type | Required domain owner |
|---|---|
| First/Second-half markets | Halves |
| League-bias label | League Bias |
| Value-qualified label | Value |
| Odds-confirmed label | Odds Intelligence |
| Straight result mismatch | PurePPG or Mismatch |
| Active streak claim | Streaks |
| Trend claim | Trend |

A half market cannot qualify without Halves approval. A market cannot be called positive value without Value approval.

## 3. Standard engine message

Every engine must return:

```text
candidate_market
market_family
direction
score
data_quality
status
veto_level
veto_scope
exact_triggers
warnings
compatible_safer_markets
```

Missing required fields make the engine output unusable.

## 4. Agreement types

### Exact-market agreement
Same exact market.

Examples:

- Trend: O1.5
- League Bias: O1.5
- Value: O1.5

### Directional agreement
Related markets support the same side.

Example:

- Home Win
- Home DNB
- 1X
- Home O0.5

### Family agreement
Markets support the same goal family.

Example:

- O2.5
- O1.5
- BTTS Yes

Family agreement is weaker than exact-market agreement.

## 5. Default evidence weights

These are starting weights and must be backtested:

| Engine | Weight |
|---|---:|
| PurePPG Pro | 1.20 |
| Mismatch | 1.10 |
| Trend | 1.00 |
| Halves | 1.00 within half domain |
| League Bias | 0.90 |
| Streaks | 0.85 |
| Momentum | 0.85 |
| Odds Intelligence | 1.00 |
| Value | 1.15 |

A specialist with data quality below 72 contributes no positive weight.

## 6. Consensus Support

For each candidate:

```text
Engine Support =
Weight × ((Score − 70) / 22)
```

Only Qualified or stronger outputs count positively.

Total support is the sum of positive Engine Support values.

A Watchlist output contributes zero, but its warning remains visible.

## 7. Qualification paths

### Path A: Exact-market consensus

- at least three qualified engines support the exact market;
- one must be a domain owner where applicable;
- combined support ≥2.20;
- no hard veto;
- at most one soft veto;
- PurePPG/Trend/Mismatch direction is not opposite.

### Path B: Directional consensus

- at least four engines support the same direction;
- at least two exact-market supporters for the selected safer market;
- combined directional support ≥3.00;
- choose the safest market independently passing its own rules;
- no hard directional veto.

### Path C: Specialist-domain consensus

For half or league-specific markets:

- domain owner score ≥84;
- at least two additional engines support the same family;
- Value passes when a value label is requested;
- Odds Intelligence has no hard veto;
- combined support ≥2.50.

## 8. Veto handling

### Hard veto

A hard veto blocks only its stated scope.

Examples:

- Halves hard veto blocks the half market, not a full-time DNB.
- Value hard veto blocks the value label, not the statistical candidate.
- Odds hard veto may block the exact price-dependent market.
- Data contamination hard veto blocks the fixture entirely.

Two independent hard vetoes on the same direction:

```text
No Bet
```

### Soft veto

One soft veto requires downgrade or an additional qualified supporter.

Two soft vetoes on the same market:

```text
Aggressive market blocked
```

Evaluate the safer descendant.

## 9. Conflict rules

- Strong home and strong away directional support: No Bet.
- Over and Under family support within two consensus points: No Bet.
- BTTS Yes and No both receive strong support: No Bet.
- Straight Win cannot beat DNB unless its exact support exceeds DNB by at least 0.50 consensus points.
- Aggressive goal market cannot beat safer line unless its Value and domain-owner support are both stronger.

## 10. Final market hierarchy

For close candidates within 0.35 consensus points:

1. Double Chance
2. DNB
3. Team O0.5
4. Team U1.5
5. O1.5 or U3.5
6. Half O0.5/U1.5
7. O/U2.5 or BTTS
8. Straight Win
9. Highly specific half markets

This hierarchy applies only when each market independently qualifies.

## 11. Final Pro score

```text
Pro Score =
0.45(Consensus Strength)
+ 0.20(Average Data Quality)
+ 0.15(Exact-Market Agreement)
+ 0.10(Domain-Owner Strength)
+ 0.10(Value/Odds Validation)
− Veto and Conflict Penalties
```

Normalize to 0–92.

Official output requires:

- Pro Score ≥82
- average data quality ≥78
- no hard veto
- at least one exact-market agreement beyond the primary engine

Prime label requires score ≥88 and Value qualification.

## 12. Final output

```text
FINAL MARKET:
PRO SCORE:
CONSENSUS TYPE:
EXACT SUPPORTERS:
DIRECTIONAL SUPPORTERS:
DOMAIN OWNER:
VALUE STATUS:
ODDS STATUS:
HARD VETOES:
SOFT VETOES:
DOWNGRADES:
EXACT REASON:
FINAL STATUS:
```

## 13. No-Bet reasons

- insufficient exact-market agreement;
- specialist conflict;
- opposing directional support;
- domain owner rejected market;
- hard veto;
- data quality too low;
- no safer descendant passes;
- uncalibrated value model;
- odds contradiction;
- Pro Score below 82.
