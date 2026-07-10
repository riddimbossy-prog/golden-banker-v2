# PUREPPG ELITE ENGINE v4.0
## Bayesian, Opponent-Adjusted and Volatility-Controlled PPG Engine
### Complete implementation rulebook

> Purpose: football-strength analysis and simulation. Never describe an output as guaranteed or certain.

## 1. Inheritance

Elite includes Ultra v3.0 and adds Bayesian venue shrinkage, opponent-strength correction, result volatility, and a formal Data Quality Score.

## 2. Bayesian venue correction

```text
Venue reliability = Venue matches / (Venue matches + 6)
Team prior = 0.60(Overall PPG) + 0.40(League venue average)
Shrunk venue PPG = Venue reliability(Venue PPG) + (1 - Venue reliability)(Team prior)
```

## 3. Opponent adjustment

```text
Opponent ratio = Average opponent PPG faced / League average team PPG
Cap opponent ratio to 0.88-1.12
Opponent-adjusted PPG = Shrunk venue PPG * Opponent ratio
```

If opponent-strength data is missing, Elite returns No Bet.

## 4. Recent adjustment and Elite PPG

```text
Recent adjusted PPG = 0.40(Recent-ten) + 0.35(Recent-five) + 0.25(Overall)
Elite PPG = 0.35(Shrunk venue) + 0.25(Opponent-adjusted) + 0.20(Overall) + 0.20(Recent adjusted)
Elite Delta = Home Elite PPG - Away Elite PPG
```

## 5. Volatility

Convert the last ten results to 3, 1, and 0 points and calculate standard deviation.

| Standard deviation | Class | Adjustment |
|---|---|---:|
| 0.00-0.85 | Very stable | +3 |
| 0.86-1.05 | Stable | +2 |
| 1.06-1.25 | Moderate | 0 |
| 1.26-1.40 | Volatile | -5 |
| Above 1.40 | Extreme | -9 |

An extreme favorite cannot produce a straight win.

## 6. Data Quality Score

Start at 100 and deduct:

- Venue sample 8-9: -4
- Venue sample 6-7: -10
- Missing recent-ten: No Bet
- Missing opponent adjustment: No Bet
- Missing league average: No Bet
- Volatile favorite: -5
- Extreme favorite: -12
- Cup/Playoff: -8
- Venue-overall difference 0.65-0.89: -6
- Estimated rather than observed input: -5

Required Data Quality: 78 for DNB/DC, 80 for Home Win, 82 for Away Win, 80 for support markets.

## 7. Elite thresholds

| Market | Mandatory Elite trigger |
|---|---|
| Home Win | Home Elite >=2.05; Away <=1.15; Delta >=0.88; LSI >=1.17 vs <=0.91; agreement 4/4; DQ >=80 |
| Away Win | Away Elite >=2.12; Home <=1.08; edge >=1.00; LSI >=1.20 vs <=0.89; agreement 4/4; DQ >=82 |
| Home DNB | Home >=1.78; Away <=1.32; Delta >=0.60; agreement >=3; DQ >=78 |
| Away DNB | Away >=1.85; Home <=1.27; edge >=0.68; agreement >=3; DQ >=78 |
| 1X | Home >=1.62; Away <=1.38; Delta >=0.43; DQ >=76 |
| X2 | Away >=1.68; Home <=1.32; edge >=0.50; DQ >=76 |
| Home O0.5 | Home >=1.74; Away <=1.18; edge >=0.54; DQ >=80 |
| Away O0.5 | Away >=1.82; Home <=1.12; edge >=0.60; DQ >=80 |
| Away U1.5 | Home >=2.02; Away <=0.92; edge >=1.00; DQ >=80 |
| Home U1.5 | Away >=2.12; Home <=0.88; edge >=1.10; DQ >=82 |
| Under 3.5 | Edge >=0.90; weaker <=0.92; stronger >=1.98; average <=1.52; DQ >=82 |

## 8. Elite confidence

Use Ultra score, then add Bayesian/opponent/stability adjustments. Minimums:

- Official selection: 82
- Home Win: 86
- Away Win: 87
- Cup/Playoff: 87
- PPG-derived goal market cap: 83

A straight win must beat DNB by five and Double Chance by seven.

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
Run PurePPG Elite v4.0. Apply Bayesian venue shrinkage, opponent adjustment, recent adjustment, volatility, Data Quality, Elite thresholds and conflict rules. Output one market or No Bet.
```
