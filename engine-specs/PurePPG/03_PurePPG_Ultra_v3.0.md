# PUREPPG ULTRA ENGINE v3.0
## League-Normalized and Trend-Agreement PPG Engine
### Complete implementation rulebook

> Purpose: football-strength analysis and simulation. Never describe an output as guaranteed or certain.

## 1. Inheritance

Ultra includes Strict v2.0 and adds recent-ten form, league normalization, four-way trend agreement, and more aggressive abstention.

## 2. Required additions

- Recent-ten PPG for both teams
- League average home PPG
- League average away PPG
- At least 50 completed league fixtures for a stable league baseline

If recent-ten or league averages are missing, Ultra returns No Bet rather than falling back.

## 3. Ultra PPG

```text
Ultra PPG = 0.45(Venue PPG) + 0.20(Overall PPG) + 0.20(Recent-ten PPG) + 0.15(Recent-five PPG)
Home LSI = Home venue PPG / League average home PPG
Away LSI = Away venue PPG / League average away PPG
Ultra Delta = Home Ultra PPG - Away Ultra PPG
```

## 4. Trend Agreement

Award one point when the proposed favorite leads in each:

1. Venue PPG
2. Overall PPG
3. Recent-ten PPG
4. Recent-five PPG

Requirements:

- Straight Win: 4/4
- DNB: at least 3/4
- Double Chance: at least 3/4
- Team support market: 4/4
- Under 3.5: stronger side must pass 3/4 and weaker side must not be improving sharply

## 5. Ultra hard gates

- Fewer than 8 venue matches: No Bet.
- Straight Win requires 10 venue matches.
- Absolute Ultra Delta below 0.30: No Bet.
- Recent-five and recent-ten difference above 0.75 for either team: No Bet.
- Favorite LSI below 1.05: no directional market.
- Opponent LSI above 1.05: no straight win.
- League sample below 50: No Bet.

## 6. Ultra market thresholds

| Market | Mandatory Ultra trigger |
|---|---|
| Home Win | Home Ultra >=2.02; Away <=1.16; Delta >=0.84; Home LSI >=1.15; Away LSI <=0.92; agreement 4/4 |
| Away Win | Away Ultra >=2.08; Home <=1.10; edge >=0.96; Away LSI >=1.18; Home LSI <=0.90; agreement 4/4 |
| Home DNB | Home >=1.75; Away <=1.35; Delta >=0.56; Home LSI >=1.08; agreement >=3 |
| Away DNB | Away >=1.82; Home <=1.30; edge >=0.63; Away LSI >=1.10; agreement >=3 |
| 1X | Home >=1.58; Away <=1.42; Delta >=0.40; agreement >=3 |
| X2 | Away >=1.64; Home <=1.36; edge >=0.46; agreement >=3 |
| Home O0.5 | Home >=1.70; Away <=1.22; Delta >=0.50; agreement 4/4 |
| Away O0.5 | Away >=1.78; Home <=1.16; edge >=0.56; agreement 4/4 |
| Away U1.5 | Home >=2.00; Away <=0.95; Delta >=0.95; Home LSI >=1.15 |
| Home U1.5 | Away >=2.10; Home <=0.90; edge >=1.05; Away LSI >=1.18 |
| Under 3.5 | Edge >=0.85; weaker <=0.95; stronger >=1.95; average <=1.55 |

## 7. Ultra scoring

Start from Strict market score and apply:

- +4 for 4/4 agreement
- +2 for 3/4 agreement
- +3 when favorite LSI is at least 1.20
- +2 when opponent LSI is at most 0.88
- -5 when the league home/away baseline differs from the global baseline by more than 0.20 and no league-specific calibration exists
- -8 for Cup or Playoff

Minimums:

- Official selection: 81
- Home Win: 85
- Away Win: 86
- Cup/Playoff: 86

## 8. Ultra market selection

A result market is preferred over a PPG-derived goal market unless the goal market scores at least four points higher. A straight win must beat DNB by four and Double Chance by six.

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
Run PurePPG Ultra v3.0. Require recent-ten and league averages, calculate Ultra PPG and league strength indices, apply four-way Trend Agreement, use Ultra thresholds, and return one market or No Bet.
```
