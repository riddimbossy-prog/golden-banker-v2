# PUREPPG PRIME ENGINE v6.0
## Calibrated Reliability and League-Aware PPG Engine
### Complete implementation rulebook

> Purpose: football-strength analysis and simulation. Never describe an output as guaranteed or certain.

## 1. Inheritance

Prime includes Apex v5.0 and adds market-specific calibration, league reliability, confidence caps, and model-decay monitoring. Prime does not use bookmaker value as a core requirement; that belongs to the separate Value engine.

## 2. Historical calibration

Maintain separate records for each market and confidence band:

- Selections, wins, losses, pushes
- Strike rate
- Brier score
- Expected Calibration Error
- Results by league, sample size, edge band, and volatility class

Minimum calibration samples:

- Global market calibration: 300 settled selections
- League-market calibration: 100 settled selections
- Below those samples, the model is Provisional.

## 3. Calibrated probability

Use logistic regression, isotonic regression, or Bayesian logistic regression with only pre-match features:

- Conservative Edge
- Apex PPG values
- Relative strength gap
- Draw Risk
- Data Quality
- Trend Agreement
- Stability difference
- Venue sample
- League reliability

Return a probability interval. Do not convert a raw confidence score directly into probability.

## 4. League Reliability Score

Start each league at 70 after 100 historical fixtures. After at least 100 settled engine selections:

- Calibrated strike rate 80%+: 80
- 75-79%: 75
- 69-74%: 70
- 63-68%: 63
- Below 63%: 55

Confidence adjustment = (League Reliability - 70) / 2, capped at +5/-8.

## 5. Model-decay monitoring

Compare the last 50 and 100 selections with long-term calibrated performance.

- Recent performance 8 percentage points below long-term: -5 and warning
- 12 points below: suspend that league-market combination
- Suspended output: `No Bet — model under review`

## 6. Prime qualification

Every Apex trigger must pass, plus:

- Calibrated lower probability bound must meet the market floor.
- Calibration grade must be A, B, or Provisional with a confidence cap.
- League Reliability must be at least 63.
- No decay suspension.

Probability lower-bound floors:

| Market | Minimum lower bound |
|---|---:|
| Home Win | 0.66 |
| Away Win | 0.64 |
| DNB | 0.72 |
| Double Chance | 0.76 |
| Team Over 0.5 | 0.78 |
| Team Under 1.5 | 0.74 |
| Under 3.5 | 0.75 |

## 7. Prime confidence

Displayed confidence is reliability, not guaranteed probability.

```text
Prime Confidence = 35%(calibrated probability quality) + 20%(Data Quality) + 20%(calibration quality) + 10%(Trend Agreement) + 10%(stability) + 5%(league reliability)
```

Caps:

- Provisional market: 81
- Provisional league-market: 83
- PPG-derived goal market: 82
- Cup/Playoff: 84
- Maximum displayed confidence: 92

Minimums:

- Official selection: 84
- Home Win: 88
- Away Win: 89

## 8. Prime conflict resolution

Rank markets by lower probability bound first, then confidence, Data Quality, and safety. A straight win must exceed DNB's lower probability bound by at least four percentage points and Double Chance by six.

## Supported markets

The engine may output only:

- Home Win
- Away Win
- Home Draw No Bet
- Away Draw No Bet
- Double Chance 1X
- Double Chance X2
- Home Over 0.5 Team Goals
- Away Over 0.5 Team Goals
- Away Under 1.5 Team Goals
- Home Under 1.5 Team Goals
- Under 3.5 Goals
- No Bet

PPG alone must not create BTTS, Over/Under 2.5, correct score, clean-sheet, half-time, draw-at-either-half, draw-both-halves, or team-over-1.5 selections.

## Universal No-Bet rules

Return No Bet when any of these applies:

- Required data is missing or internally inconsistent.
- A future result or post-match statistic has contaminated the input.
- The two teams are too balanced for a directional market.
- Both teams are weak and unstable.
- Recent form strongly contradicts the proposed favorite.
- Venue and overall PPG disagree beyond the engine's tolerance.
- The final score is below the engine's minimum confidence.
- Opposing directional markets survive conflict resolution.
- The competition type is excluded by the engine.

## Output format

| Time | League | Fixture | Home PPG | Away PPG | Edge | Final Market | Confidence | Class | Exact Trigger | Warnings |
|---|---|---|---:|---:|---:|---|---:|---|---|---|

Always output one market or `No Bet — exact reason`. Never return several alternatives.

## Master instruction

```text
Run PurePPG Prime v6.0. First pass every Apex rule, then apply market and league calibration, probability intervals, league reliability and decay monitoring. Output one calibrated market or No Bet.
```
