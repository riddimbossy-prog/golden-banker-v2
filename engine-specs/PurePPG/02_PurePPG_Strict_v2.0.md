# PUREPPG STRICT ENGINE v2.0
## Tighter Threshold and Reduced-Volume PPG Engine
### Complete implementation rulebook

> Purpose: football-strength analysis and simulation. Never describe an output as guaranteed or certain.

## 1. Inheritance

Strict includes every Normal v1.0 rule unless this document replaces it. Where rules conflict, Strict wins.

## 2. Objective

Strict removes marginal Normal selections. It raises PPG gaps, sample minimums, confidence floors, and form-confirmation requirements.

## 3. Effective PPG

```text
Effective PPG = 0.55(Venue PPG) + 0.25(Overall PPG) + 0.20(Recent-five PPG)
```

Venue remains dominant, while recent-five form is prevented from overpowering a larger season sample.

## 4. Hard gates

- Fewer than 6 venue matches for either team: No Bet.
- Straight win requires at least 8 venue matches for both teams.
- Friendly, Youth, and Reserve: No Bet.
- Both Effective PPG values below 1.20: No Bet.
- Absolute Delta below 0.28: No Bet.
- Venue-overall difference 0.80+: No Bet.
- Proposed favorite recent-five PPG below 1.00: no straight win or DNB.

## 5. Stricter market thresholds

| Market | Mandatory Strict trigger |
|---|---|
| Home Win | Home >=2.00; Away <=1.20; Delta >=0.80; one of Home >=2.15, Away <=0.95, Delta >=1.00 |
| Away Win | Away >=2.05; Home <=1.15; away edge >=0.90; one of Away >=2.20, Home <=0.90, edge >=1.10 |
| Home DNB | Home >=1.72; Away <=1.38; Delta 0.52-0.84 |
| Away DNB | Away >=1.78; Home <=1.35; away edge 0.58-0.89 |
| 1X | Home >=1.55; Away <=1.48; Delta 0.36-0.64 |
| X2 | Away >=1.60; Home <=1.42; away edge 0.42-0.69 |
| Home O0.5 | Home >=1.65; Away <=1.28; Delta >=0.45; recent-five >=1.30 |
| Away O0.5 | Away >=1.72; Home <=1.22; edge >=0.50; recent-five >=1.35 |
| Away U1.5 | Home >=1.95; Away <=1.00; Delta >=0.90 |
| Home U1.5 | Away >=2.05; Home <=0.95; edge >=1.00 |
| Under 3.5 | Absolute Delta >=0.80; weaker <=1.00; stronger >=1.90; Average PPG <=1.58 |

## 6. Confirmation rules

- Straight Win: favorite must lead venue, overall, and recent-five PPG.
- DNB: favorite must lead at least two of those three.
- Double Chance: favorite must lead venue and at least one other measure.
- Any goal-related support market requires the same directional agreement as DNB.
- If recent-five PPG differs from overall PPG by more than 0.70, deduct 8 and block straight win.

## 7. Confidence changes

Use Normal scoring, then apply these Strict changes:

- Add +2 when all three strength measures agree.
- Deduct 4 when only two agree.
- Deduct 7 when the favorite has moderate volatility in its last five outcomes.
- Deduct 10 for Cup or Playoff.
- Cap any PPG-derived goal market at 84.

Minimums:

- Official selection: 80
- Home Win: 84
- Away Win: 85
- Cup/Playoff: 85

## 8. Conflict rules

- Straight Win must beat DNB by 4 and Double Chance by 5.
- DNB must beat Double Chance by 3.
- A team-goal market must beat a result market by 3.
- If two different directions survive, No Bet.

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
Run PurePPG Strict v2.0. Inherit Normal, apply the stricter sample, threshold, form-agreement and confidence rules, compare every passing market, and output one final market or No Bet.
```
