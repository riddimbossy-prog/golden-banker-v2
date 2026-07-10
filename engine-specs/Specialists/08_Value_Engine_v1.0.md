# Predict2U Value Engine v1.0
## Calibrated Probability, Fair Price and Risk-Adjusted Edge Analyzer

## 1. Objective

The Value Engine does not create probabilities from raw scores. It receives calibrated market probabilities from validated models and compares them with de-vigged market prices.

Output one positive-value market or:

```text
No Bet — insufficient calibrated value
```

## 2. Required inputs

- exact market and settlement rules;
- calibrated model probability;
- lower and upper probability bounds;
- calibration sample size;
- Brier score or calibration error;
- current decimal odds from at least four books;
- de-vigged fair market probability;
- liquidity/market-quality flag;
- correlation with other proposed selections.

## 3. Mandatory calibration

Each market must have its own calibration.

Minimum settled historical selections:

- 300 for provisional use;
- 750 for standard use;
- 1,500 preferred.

Before 300:

```text
Hard veto — probability not sufficiently calibrated
```

Do not use Home Win calibration for DNB, Double Chance or team goals.

## 4. Fair market probability

Normalize each bookmaker market separately.

```text
Raw implied probability = 1 / decimal odds
Fair probability = raw probability / market raw-probability sum
```

Aggregate using the median fair probability.

For three-way markets, multiplicative normalization is the default. A calibrated Shin adjustment may be used consistently, but methods must not be mixed inside one comparison.

## 5. Conservative model probability

```text
Conservative Probability = Lower Bound of Model Interval
```

Never use the midpoint for the value gate.

## 6. Value metrics

```text
Probability Edge =
Conservative Probability − Fair Market Probability
```

```text
Expected Value =
(Model Midpoint Probability × Decimal Odds) − 1
```

```text
Conservative EV =
(Conservative Probability × Decimal Odds) − 1
```

Both Probability Edge and Conservative EV must be positive.

## 7. Minimum gates

| Market | Min probability edge | Min conservative EV |
|---|---:|---:|
| Home Win | +4 pts | +3% |
| Away Win | +5 pts | +4% |
| DNB | +4 pts | +3% |
| Double Chance | +3 pts | +2% |
| Team O0.5/U1.5 | +4 pts | +3% |
| O/U1.5 or 3.5 | +4 pts | +3% |
| O/U2.5 or BTTS | +5 pts | +4% |
| Half markets | +6 pts | +5% |

The Value Engine may raise these thresholds for volatile leagues.

## 8. Price and market limits

Default decimal-odds band:

```text
1.15 to 3.00
```

Outside this band, the market is blocked unless separately calibrated.

Additional blocks:

- overround above 10%;
- bookmaker dispersion above 7 fair-probability points;
- stale price;
- suspended or thin market;
- probability interval width above 18 points;
- model decay warning.

## 9. Risk-Adjusted Value Score

Convert components to 0–100:

```text
Value Score =
0.30(Probability Edge Quality)
+ 0.20(Conservative EV Quality)
+ 0.20(Calibration Quality)
+ 0.10(Interval Tightness)
+ 0.10(Market Quality)
+ 0.10(Cross-Model Agreement)
```

Penalties:

- provisional calibration −6
- volatile league −5
- odds movement against candidate −4
- specialist conflict −8
- interval width 14–18 points −5
- closing-line underperformance warning −6

## 10. Market selection

Evaluate every candidate market supplied by the other engines.

Select the market with the highest Risk-Adjusted Value Score, not necessarily the highest raw EV.

Tie rule within two points:

1. tighter probability interval;
2. higher data quality;
3. safer settlement structure;
4. lower model disagreement.

No correlated double selections from the same fixture.

## 11. Calibration health

Track:

- Brier score;
- log loss;
- expected calibration error;
- strike rate by probability band;
- closing-line value;
- ROI by league and market;
- last 50, 100 and 250 selections.

Suspend a market model when recent calibration error worsens materially or last-100 performance falls 12 percentage points below long-term expectation.

## 12. Vetoes

Hard veto:

- no calibrated probability;
- calibration sample below 300;
- lower probability bound does not clear fair price;
- conservative EV is non-positive;
- market settlement differs from model target;
- severe model decay.

Soft veto:

- positive midpoint EV but insufficient conservative edge;
- compatible candidate remains statistical only, not value-qualified.

## 13. Output requirement

Show model midpoint and interval, conservative probability, fair market probability, probability edge, EV, conservative EV, calibration sample, calibration health, Value Score and veto scope.
