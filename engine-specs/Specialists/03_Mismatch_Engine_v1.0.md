# Predict2U Mismatch Engine v1.0
## Multi-Dimensional Strength-Gap and Attack-vs-Defense Analyzer

## 1. Objective

The Mismatch Engine finds fixtures where one team is superior across several independent dimensions. It must not label a fixture a mismatch because of table position or PPG alone.

Output one market or:

```text
No Bet — mismatch not broad enough
```

## 2. Supported markets

- Home Win, Away Win
- Home DNB, Away DNB
- 1X, X2
- Favorite O0.5, Favorite O1.5
- Opponent U1.5
- Favorite to win either half
- Under 3.5 as a protection market

## 3. Required dimensions

At least five of these six must be available:

1. venue-adjusted PPG or rating;
2. goal-difference per match;
3. expected-goal difference or shot-quality proxy;
4. shots-on-target differential;
5. recent-form strength;
6. attack-vs-opponent-defense matchup.

Optional context:

- schedule strength;
- squad availability;
- rest;
- promotion/relegation status.

Missing xG may be replaced by big-chance or SOT quality, but not by goals alone.

## 4. Normalize every dimension

Convert each team metric to a league percentile from 0 to 100.

For lower-is-better defensive metrics, reverse the percentile.

```text
Dimension Gap = Favorite percentile − Opponent percentile
```

Cap each dimension gap to ±50 to stop one metric dominating.

## 5. Core Mismatch Index

```text
Mismatch Index =
0.20(PPG/Rating Gap)
+ 0.18(Goal-Difference Gap)
+ 0.18(xG or Quality Gap)
+ 0.14(SOT Gap)
+ 0.14(Recent-Form Gap)
+ 0.16(Attack-vs-Defense Gap)
```

Convert the weighted gap to a 0–100 directional score:

- 50 = balanced
- above 50 favors home
- below 50 favors away

Directional Mismatch Strength:

```text
DMS = abs(Mismatch Index − 50) × 2
```

## 6. Breadth test

Count dimensions favoring the same team by at least 10 percentile points.

- Straight Win: at least 5/6
- DNB: at least 4/6
- Double Chance: at least 4/6
- Team O1.5: attack and matchup dimensions are mandatory
- Opponent U1.5: defensive and opponent-attack dimensions are mandatory

## 7. Trap controls

Block or penalize when:

- favorite's strength comes mainly from finishing above xG: −6;
- opponent recently improved by 20+ percentile points: −5;
- favorite has extreme venue/overall disagreement: −6;
- large table gap but Mismatch breadth below 4/6: hard veto;
- favorite faces a top-quarter defense: aggressive team-goal market blocked;
- missing three or more dimensions: no market.

## 8. Market rules

### Home Win

- Home DMS ≥78
- Home leads at least 5/6 dimensions
- venue PPG/rating gap supports home
- attack-vs-defense gap ≥20 percentiles
- recent-form gap is not negative
- data quality ≥82
- Mismatch score ≥85

### Away Win

- Away DMS ≥82
- Away leads at least 5/6
- attack-vs-defense gap ≥22
- recent form supports away
- data quality ≥85
- score ≥86

### DNB

Home DNB:

- Home DMS ≥68
- at least 4/6 dimensions
- no more than one material negative dimension
- data quality ≥76
- score ≥81

Away DNB requires DMS ≥72 and score ≥82.

### Double Chance

1X:

- Home DMS ≥60
- at least 4/6 dimensions
- home venue dimension positive
- score ≥78

X2 requires DMS ≥64 and score ≥79.

### Favorite O0.5

- favorite attack percentile ≥60
- opponent defense weakness percentile ≥60
- attack-vs-defense gap ≥18
- favorite scored rate and opponent conceded rate each ≥70%
- DMS ≥64
- score ≥80

### Favorite O1.5

- favorite attack percentile ≥75
- opponent defense weakness percentile ≥70
- favorite 2+ scoring rate ≥55%
- opponent 2+ conceding rate ≥50%
- xG or SOT quality confirms
- DMS ≥76
- score ≥85

### Opponent U1.5

- favorite defense percentile ≥70
- opponent attack percentile ≤35
- opponent U1.5 rate ≥72%
- favorite allowed U1.5 in ≥70%
- DMS ≥72
- score ≥82

### Win Either Half

- favorite DMS ≥70
- any-half-win rate ≥70%
- opponent any-half-loss rate ≥60%
- score ≥82

### Under 3.5

- DMS ≥70
- weaker attack percentile ≤35
- stronger defense percentile ≥60
- league U3.5 rate ≥68%
- no high-tempo contradiction
- score ≥80

## 9. Score

```text
Mismatch Score =
0.50(DMS)
+ 0.15(Breadth Score)
+ 0.15(Attack-Defense Fit)
+ 0.10(Data Quality)
+ 0.10(Context Stability)
− Penalties
```

## 10. Vetoes

Hard veto:

- table or reputation says mismatch but fewer than 4/6 dimensions agree;
- attack-goal market lacks attack/defense confirmation;
- severe data disagreement.

Soft veto:

- result mismatch exists but draw risk or recent form weakens straight win;
- downgrade to DNB or Double Chance.

## 11. Output requirement

Show every dimension gap, breadth count, DMS, trap warnings and why the final market is safer than alternatives.
