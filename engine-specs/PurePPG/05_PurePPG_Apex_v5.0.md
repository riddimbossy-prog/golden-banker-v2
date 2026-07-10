# PUREPPG APEX ENGINE v5.0
## Uncertainty-Aware Conservative-Edge PPG Engine
### Complete implementation rulebook

> Purpose: football-strength analysis and simulation. Never describe an output as guaranteed or certain.

## 1. Inheritance

Apex includes Elite v4.0 and replaces mean-only comparisons with uncertainty ranges and Conservative Edge.

## 2. Apex PPG

Use Elite PPG as the central estimate and call it Apex PPG.

## 3. Uncertainty margin

Start at 0.16 and add:

- Venue sample 8-9: +0.04
- Venue sample 6-7: +0.08
- Volatile results: +0.05
- Extreme volatility: +0.10
- Cup/Playoff: +0.07
- Promoted/relegated team: +0.05
- Venue-overall difference 0.65+: +0.05

Subtract:

- 15+ venue matches: -0.03
- Very stable form: -0.03
- Full trend agreement: -0.03

Clamp uncertainty to 0.10-0.40.

```text
Lower PPG = Apex PPG - uncertainty
Upper PPG = Apex PPG + uncertainty
Home Conservative Edge = Home lower - Away upper
Away Conservative Edge = Away lower - Home upper
```

## 4. Draw Risk Index

Calculate on a 0-100 scale:

```text
Draw Risk = 35%(League draw rate score) + 35%(PPG balance score) + 15%(stability similarity) + 15%(relative-strength similarity)
```

- 0-39 Low
- 40-54 Moderate
- 55-69 High
- 70+ Very High

Straight Win is blocked at Very High and loses 5 points at High. DNB is preferred at High.

## 5. Apex hard gates

- Conservative Edge below 0.12: No Bet.
- Data Quality below 78: No Bet.
- Uncertainty above 0.34 for either team: No Bet.
- Straight Win requires uncertainty no higher than 0.24 for both teams.
- Intervals substantially overlap and Trend Agreement is below 4/4: No Bet.

## 6. Apex thresholds

| Market | Mandatory Apex trigger |
|---|---|
| Home Win | Home Apex >=2.08; Away <=1.12; Conservative Edge >=0.55; Draw Risk <=54; DQ >=82 |
| Away Win | Away Apex >=2.15; Home <=1.05; Conservative Edge >=0.65; Draw Risk <=49; DQ >=84 |
| Home DNB | Home >=1.80; Away <=1.30; Conservative Edge >=0.32; Draw Risk <=69; DQ >=80 |
| Away DNB | Away >=1.88; Home <=1.25; Conservative Edge >=0.38; Draw Risk <=64; DQ >=80 |
| 1X | Home >=1.65; Away <=1.35; Conservative Edge >=0.20; DQ >=78 |
| X2 | Away >=1.72; Home <=1.28; Conservative Edge >=0.24; DQ >=78 |
| Home O0.5 | Home >=1.78; Away <=1.15; Conservative Edge >=0.30; DQ >=82 |
| Away O0.5 | Away >=1.86; Home <=1.10; Conservative Edge >=0.35; DQ >=82 |
| Away U1.5 | Home >=2.05; Away <=0.90; Conservative Edge >=0.60; DQ >=82 |
| Home U1.5 | Away >=2.15; Home <=0.85; Conservative Edge >=0.70; DQ >=84 |
| Under 3.5 | Absolute Conservative Edge >=0.58; weaker <=0.90; stronger >=2.00; average <=1.50; DQ >=84 |

## 7. Apex confidence

Start from Elite confidence, then:

- +4 for Conservative Edge 0.60+
- +2 for both uncertainty margins <=0.18
- -5 for High Draw Risk
- -8 for one uncertainty margin above 0.28

Minimums:

- Official selection: 83
- Home Win: 87
- Away Win: 88
- PPG-derived goal cap: 82

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
Run PurePPG Apex v5.0. Calculate uncertainty intervals and Conservative Edge, apply Draw Risk and Data Quality, evaluate every market with Apex thresholds, and output one market or No Bet.
```
