# PUREPPG NORMAL ENGINE v1.0
## Standard PPG Strength, Result and Safety-Market Engine
### Complete implementation rulebook

> Purpose: football-strength analysis and simulation. Never describe an output as guaranteed or certain.

## 1. Objective

Normal is the baseline engine. It uses venue PPG, overall PPG, recent-five PPG, sample size, competition type, market-specific thresholds, and conflict resolution. It should produce a reasonable number of selections while still rejecting obvious uncertainty.

## 2. Required inputs

- Match time, league, home team, away team
- Home venue PPG and away venue PPG
- Home overall PPG and away overall PPG
- Home recent-five PPG and away recent-five PPG
- Home and away venue sample sizes
- Competition type: League, Cup, Playoff, Friendly, Youth, Reserve

When only venue PPG is available, use it directly and deduct 6 confidence points. When venue and overall PPG are available but recent form is missing, use 65% venue and 35% overall and deduct 3 points.

## 3. Effective PPG

```text
Home Effective PPG = 0.50(Home venue PPG) + 0.25(Home overall PPG) + 0.25(Home recent-five PPG)
Away Effective PPG = 0.50(Away venue PPG) + 0.25(Away overall PPG) + 0.25(Away recent-five PPG)
Delta = Home Effective PPG - Away Effective PPG
Absolute Delta = abs(Delta)
Average PPG = (Home Effective PPG + Away Effective PPG) / 2
```

## 4. Tiers

| Tier | Effective PPG |
|---|---:|
| Elite | 2.20+ |
| Banker | 2.00-2.19 |
| Strong | 1.75-1.99 |
| Competitive | 1.45-1.74 |
| Average | 1.20-1.44 |
| Weak | 0.90-1.19 |
| Poor | Below 0.90 |

## 5. Sample and competition controls

- 10+ venue matches: no penalty
- 7-9: -3
- 5-6: -7; straight wins require the stronger trigger
- Below 5: -12; no straight win or team-under-1.5; maximum Double Chance
- Cup: -8 and +0.10 extra PPG edge for a straight win
- Playoff: -6
- Friendly: No Bet
- Youth/Reserve: -10; maximum confidence 79; no Under 3.5

## 6. Recent-form filter

- Positive agreement: stronger team also has equal or better recent-five PPG and is no more than 0.35 below overall PPG.
- Mild warning: recent-five is 0.36-0.60 below overall; deduct 5.
- Major warning: recent-five is more than 0.60 below overall or 0.40 below the opponent; block straight win and downgrade one level.

## 7. Market rules

### Home Win
All: Home >=1.95; Away <=1.25; Delta >=0.70; Home Strong+; Away Weak/Poor. Also one of: Home >=2.10, Away <=1.00, Delta >=0.90. Minimum venue sample 7.

### Away Win
All: Away >=2.00; Home <=1.20; away edge >=0.80; Away Banker/Elite; Home Weak/Poor. Also one of: Away >=2.15, Home <=0.95, edge >=1.00. Minimum venue sample 7.

### Home DNB
Home >=1.65; Away <=1.45; Delta 0.45-0.79; Home Competitive+. Require recent agreement, venue advantage >=0.55, or Away <=1.20.

### Away DNB
Away >=1.70; Home <=1.40; away edge 0.50-0.84; Away Competitive+. Require recent agreement, venue advantage >=0.60, or Home <=1.10.

### 1X
Home >=1.45; Away <=1.55; Delta 0.30-0.59; Home Competitive+. Block when both teams are Weak/Poor.

### X2
Away >=1.50; Home <=1.50; away edge 0.35-0.64; Away Competitive+. Block when both teams are Weak/Poor.

### Home Over 0.5
Home >=1.55; Away <=1.35; Delta >=0.35; Home recent-five >=1.20.

### Away Over 0.5
Away >=1.65; Home <=1.30; away edge >=0.40; Away recent-five >=1.25.

### Away Under 1.5
Home >=1.85; Away <=1.10; Delta >=0.75; Home Strong+; Away Weak/Poor; sample >=7.

### Home Under 1.5
Away >=1.95; Home <=1.05; away edge >=0.85; Away Strong+; Home Weak/Poor; sample >=7.

### Under 3.5
Absolute Delta >=0.65; one team Weak/Poor; stronger team Strong+; Average PPG <=1.65. Require one of: weaker <=1.00, edge >=0.90, stronger >=2.00. Reject if both teams are Strong+, both recent PPG values are >=1.80, or sample is below 7.

## 8. Scoring

- Home Win: 60 + 20(edge) +8 if favorite >=2.00 +5 if >=2.20 +6 if opponent <=1.00 +4 for strong recent agreement. Cap 94.
- Away Win: 58 + 20(edge) +8 if favorite >=2.05 +5 if >=2.20 +6 if opponent <=0.95 +4 recent agreement. Cap 93.
- DNB: 62 + 18(edge) +5 favorite Strong+ +4 opponent Weak/Poor +4 recent agreement. Cap 89.
- Double Chance: 66 + 14(edge) +5 selected team Strong+ +4 opponent Average-or-lower +3 recent agreement. Cap 87.
- Team Over 0.5: 63 + 12(edge) +5 selected team Strong+ +4 opponent Weak/Poor +3 recent agreement. Cap 85.
- Team Under 1.5: 62 + 13(edge) +5 weaker team Poor +4 stronger team Banker/Elite +3 recent agreement. Cap 86.
- Under 3.5: 61 + 10(edge) +4 weaker team Poor +3 stronger team Banker/Elite -5 if both recent values exceed 1.70. Cap 83.

Apply sample, competition, recent-form, and venue-disagreement penalties after scoring.

## 9. Thresholds and conflict resolution

- Official selection: 78+
- Straight win: 82+
- Cups/playoffs: 82+
- Youth/Reserve: 84+

When scores are within two points, prefer: Double Chance, DNB, Team Over 0.5, Team Under 1.5, Under 3.5, Home Win, Away Win. A straight win must beat DNB by at least 3 and Double Chance by at least 4.

Venue-vs-overall difference 0.40-0.64: -3. At 0.65+, block straight win unless recent form confirms. At 0.90+, default No Bet.

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
Run PurePPG Normal v1.0. Calculate Effective PPG, apply sample, competition, recent-form and venue-disagreement controls, evaluate every eligible market, score each market separately, resolve conflicts, and output one final market or No Bet with an exact reason.
```
