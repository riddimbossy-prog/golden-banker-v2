# PUREPPG EXPERT ENGINE v7.0
## Context-Sensitive Hierarchical PPG Engine
### Complete implementation rulebook

> Purpose: football-strength analysis and simulation. Never describe an output as guaranteed or certain.

## 1. Inheritance

Expert includes Prime v6.0 and adds season-phase, promotion/relegation, similar-opponent, schedule-cluster, rest, and split-stability controls. All added information must be available before kickoff.

## 2. Additional inputs

- Season phase: opening, established, run-in
- Newly promoted/relegated status
- PPG against top, middle, and bottom-third opponents
- Average rest days
- Current fixture-density class
- Home/away split stability over rolling blocks

If these are unavailable, Expert returns No Bet rather than silently reverting to Prime.

## 3. Season phase

- Opening phase: fewer than 8 league matches; No Bet.
- Established phase: 8-70% of schedule; normal rules.
- Run-in: final 30%; require recent-ten agreement and deduct 3 when the favorite's recent-five and recent-ten diverge by more than 0.50.

## 4. Promotion and relegation

- Newly promoted: increase league-average prior weight by 25%; no straight win until 10 current-division matches.
- Newly relegated: reduce previous-division PPG influence by 35%; no straight win until 8 current-division matches.
- Newly formed or reserve-promoted: maximum Double Chance until 12 matches.

## 5. Similar-opponent confirmation

Classify the opponent as top, middle, or bottom third by current pre-match table. The proposed favorite must not have a cluster PPG more than 0.35 below its overall PPG against that opponent class.

- Straight Win: similar-opponent PPG must support the favorite.
- DNB: may tolerate a 0.20 contradiction.
- Double Chance: may tolerate a 0.35 contradiction.

## 6. Rest and density

- Rest difference against favorite of 3+ days: -4
- Favorite played three matches in eight days: -5
- Favorite played four matches in twelve days: block straight win
- Opponent has severe congestion while favorite is rested: +2 maximum

## 7. Split-stability test

Divide venue results into two equal rolling blocks.

- Block PPG difference <=0.35: stable
- 0.36-0.65: mixed, -3
- Above 0.65: unstable, -7 and block straight win

## 8. Expert confirmation matrix

The proposed direction receives one point for each:

1. Quantum/Apex PPG edge
2. Trend Agreement
3. League-relative strength
4. Opponent-adjusted PPG
5. Similar-opponent PPG
6. Stability advantage
7. Recent-ten agreement
8. Rest/density not adverse

Requirements:

- Straight Win: 8/8
- DNB: 7/8
- Double Chance: 6/8
- Team support market: 7/8
- Under 3.5: 7/8 plus league under-3.5 baseline support

## 9. Expert thresholds

Expert inherits Apex numeric triggers but raises Conservative Edge:

- Home Win: 0.62
- Away Win: 0.72
- Home DNB: 0.38
- Away DNB: 0.44
- 1X: 0.24
- X2: 0.28
- Team support markets: +0.05 over Apex
- Under 3.5: 0.65 and league Under 3.5 rate at least 70%

## 10. Expert confidence

- Official selection: 85
- Home Win: 89
- Away Win: 90
- PPG-derived goal cap: 82
- Maximum displayed confidence: 93

Any single major context contradiction blocks the highest directional market and forces one downgrade. Two major contradictions produce No Bet.

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
Run PurePPG Expert v7.0. Pass every Prime requirement, then apply season phase, promotion/relegation, similar-opponent, rest, fixture-density, split-stability and the 8-point Expert confirmation matrix. Output one market or No Bet.
```
