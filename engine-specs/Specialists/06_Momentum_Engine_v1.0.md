# Predict2U Momentum Engine v1.0
## Improvement, Decline, Acceleration and Reversal Analyzer

## 1. Objective

The Momentum Engine measures direction of performance rather than absolute strength. Momentum may confirm or weaken a selection, but it must not turn a fundamentally weak team into a straight-win favorite by itself.

Output one market or a directional veto.

## 2. Supported markets

- Home/Away DNB
- 1X, X2
- Home/Away Win, only with base-strength confirmation
- Home/Away O0.5
- Win either half
- No Bet
- Directional downgrade or veto

## 3. Required inputs

At least eight chronological matches per team:

- rolling PPG;
- rolling goal-difference per match;
- rolling xG difference or SOT differential;
- rolling scoring and conceding rates;
- opponent quality;
- venue labels;
- rest and managerial-change flags, if available.

Use only information available before kickoff.

## 4. Rolling windows

Calculate for each team:

- last 3;
- last 5;
- last 8;
- season baseline.

Do not use last-3 alone for any official selection.

## 5. Component slopes

For each metric:

```text
Slope = Last-5 value − Previous-5 value
```

Where fewer than 10 matches are available, compare last 4 with previous 4 and apply −5 data quality.

Normalize slopes to league percentiles.

## 6. Momentum Score

```text
Momentum Score =
0.30(PPG Slope)
+ 0.20(Goal-Difference Slope)
+ 0.20(xG/SOT-Difference Slope)
+ 0.10(Scoring-Rate Slope)
+ 0.10(Defensive-Rate Slope)
+ 0.10(Opponent-Adjusted Consistency)
```

Scale from −100 to +100.

Positive favors improvement. Negative indicates decline.

## 7. Acceleration

```text
Acceleration =
(Last-3 slope) − (Last-5 slope)
```

Use acceleration only as a modifier.

- strong positive acceleration: +3
- strong negative acceleration: −3
- last-3 contradicts last-8 by 35+ percentile points: instability −7

## 8. Momentum Edge

```text
Momentum Edge =
Home Momentum Score − Away Momentum Score
```

Classify absolute edge:

| Edge | Meaning |
|---:|---|
| 55+ | Extreme |
| 40–54 | Strong |
| 25–39 | Clear |
| 15–24 | Moderate |
| Below 15 | Weak |

## 9. Base-strength gate

For any directional selection, the selected team must also satisfy one:

- PurePPG Effective/Trusted PPG is not lower than opponent;
- Mismatch score is not opposite;
- season rating is within 0.20 PPG of opponent.

Straight Win requires the selected team to be stronger on base strength, not merely improving.

## 10. Market rules

### Double Chance

- Momentum Edge ≥25 toward selected side
- selected team last-5 PPG ≥1.40
- opponent last-5 PPG ≤1.20
- at least four of six momentum components agree
- base-strength gate passes
- score ≥78

Away X2 requires Edge ≥30 and score ≥79.

### DNB

- Edge ≥40
- selected last-5 PPG ≥1.60
- opponent last-5 PPG ≤1.10
- at least five components agree
- xG/SOT slope not negative
- base strength not lower
- score ≥82

### Straight Win

- Edge ≥55
- selected last-5 PPG ≥2.00
- opponent last-5 PPG ≤0.80
- base-strength advantage confirmed
- at least five components agree
- no reversal warning
- score ≥87

### Team O0.5

- selected scoring-rate slope positive;
- opponent defensive-rate slope worsening;
- selected scored in at least 4/5;
- opponent conceded in at least 4/5;
- Edge ≥25;
- score ≥80.

### Win Either Half

- selected any-half-win rate improved by at least 15 points;
- opponent any-half-loss rate worsened by at least 15 points;
- Edge ≥35;
- direct half data available;
- score ≥82.

## 11. False-favorite detection

Issue a hard aggressive-market veto when:

- season strength favors a team;
- its Momentum Score is below −35;
- opponent Momentum Score is above +20;
- at least four components support the reversal.

Scope:

```text
Block Straight Win and aggressive team-goal market.
Safer DNB or Double Chance may still be evaluated.
```

## 12. Regression warning

Momentum may be unsustainable when:

- results improved but xG/SOT did not;
- scoring rose mainly from unusually high conversion;
- opponent quality fell sharply;
- two or more one-goal wins created most of the PPG rise.

Penalty: −7. Straight Win blocked.

## 13. Score

```text
Momentum Specialist Score =
0.40(Absolute Momentum Edge)
+ 0.20(Component Agreement)
+ 0.15(Base-Strength Compatibility)
+ 0.10(Opponent Adjustment)
+ 0.10(Data Quality)
+ 0.05(Acceleration)
− Penalties
```

## 14. Hard No-Bet gates

- fewer than eight chronological matches;
- missing date order;
- no quality proxy for results;
- last-3 is the only positive signal;
- selected direction opposes both PurePPG and Mismatch strongly;
- managerial change with fewer than three post-change matches;
- friendly.

## 15. Output requirement

Show each slope, Momentum Scores, edge, agreement count, base-strength gate, regression warning, exact market and veto scope.
