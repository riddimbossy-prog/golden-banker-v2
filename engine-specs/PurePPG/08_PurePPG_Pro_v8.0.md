# PUREPPG PRO ENGINE v8.0
## Multi-Generation Consensus and Maximum-Abstention PPG Engine
### Complete implementation rulebook

> Purpose: football-strength analysis and simulation. Never describe an output as guaranteed or certain.

## 1. Objective

Pro is the flagship engine. It internally runs Normal, Strict, Ultra, Elite, Apex, Prime, and Expert, then selects only markets supported by broad cross-generation agreement. Pro is intentionally low-volume.

## 2. Internal engine run

For every fixture, record from each engine:

- Final market or No Bet
- Direction: Home, Away, Neutral
- Confidence
- Data Quality
- Warnings
- Conservative Edge where available
- Calibrated probability interval where available

## 3. Consensus families

Map exact markets into directional families:

- Home family: Home Win, Home DNB, 1X, Home Over 0.5, Away Under 1.5
- Away family: Away Win, Away DNB, X2, Away Over 0.5, Home Under 1.5
- Neutral safety family: Under 3.5
- No Bet

Goal-support markets count as only half a directional vote unless Expert also selects the same direction.

## 4. Mandatory Pro consensus

A Pro selection requires all:

1. At least 5 of 7 engines support the same direction or neutral family.
2. At least 3 of the top four engines—Elite, Apex, Prime, Expert—support that family.
3. Apex and Expert do not oppose each other.
4. Prime is not suspended or Provisional below its required cap.
5. Expert has no major context contradiction.
6. No engine with Data Quality 85+ selects the opposite direction.
7. The final Pro confidence reaches its market minimum.

Otherwise output No Bet.

## 5. Exact-market consensus

- Straight Win: at least 5 exact Win votes or 6 same-direction votes, including Prime and Expert; Apex Conservative Edge must meet Expert's threshold; calibrated lower bound must meet Prime's floor.
- DNB: at least 4 DNB-or-Win votes and at least 6 same-direction votes.
- Double Chance: at least 5 same-direction votes, with at least two top-four engines selecting Double Chance or DNB.
- Team support market: at least 4 exact support-market votes, including Expert, and no top-four result market with a higher lower-bound probability.
- Under 3.5: at least 5 exact or neutral-safety votes, including Apex, Prime, and Expert; no strong directional disagreement.

## 6. Safest common denominator

When engines agree on direction but not exact market, choose the safest market common to the evidence:

- Home Win + Home DNB + 1X becomes 1X unless Prime and Expert both support Home Win.
- Away Win + Away DNB + X2 becomes X2 unless Prime and Expert both support Away Win.
- A support market never upgrades to a straight win.
- Under 3.5 is not combined with a directional family; it must win on its own consensus.

## 7. Pro confidence

```text
Base consensus = weighted agreement across seven engines
Weights: Normal 0.05, Strict 0.08, Ultra 0.12, Elite 0.15, Apex 0.18, Prime 0.20, Expert 0.22
Pro Confidence = 40%(weighted consensus) + 20%(Prime calibrated quality) + 15%(Expert context score) + 15%(Apex uncertainty quality) + 10%(Data Quality)
```

Apply:

- -6 for any top-four warning
- -10 for one top-four No Bet
- Automatic No Bet for two top-four No Bets
- +2 maximum for unanimous seven-engine agreement

Minimums:

- Official selection: 86
- Home Win: 90
- Away Win: 91
- DNB: 88
- Double Chance: 86
- Support markets: 86, but cap at 88
- Under 3.5: 87, cap at 89
- Maximum displayed confidence: 94

## 8. Pro hard No-Bet gates

- Fewer than 5 engines agree on direction.
- Prime or Expert is suspended.
- Apex uncertainty above 0.30 for either team.
- Expert confirmation below 6/8.
- Any high-quality opposite-direction signal.
- Calibrated lower probability bound below the market floor.
- League reliability below 63.
- Data Quality below 84.
- Friendly, Youth, Reserve, or neutral venue without dedicated calibration.

## 9. Pro selection limit

Across a fixture slate, mark at most four Pro Qualified selections. Rank by:

1. Pro Confidence
2. Calibrated lower probability bound
3. Expert confirmation score
4. Apex Conservative Edge
5. Data Quality

All other passing selections remain `Qualified Watchlist`, not official Pro outputs.

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
Run PurePPG Pro v8.0 by executing Normal through Expert internally. Apply weighted cross-generation consensus, top-four agreement, exact-market consensus, safest-common-denominator rules, calibrated probability floors, Pro confidence, and hard abstention gates. Output one Pro market or No Bet.
```
