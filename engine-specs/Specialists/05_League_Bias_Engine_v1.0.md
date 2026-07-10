# Predict2U League Bias Engine v1.0
## League-Tendency Discovery and Candidate-Team Filter

## 1. Objective

The League Bias Engine first asks:

```text
Which market is structurally common in this league?
```

It then filters fixtures to find teams that genuinely match that league bias.

A league trend alone never creates a selection.

## 2. Supported markets

- Home non-loss, Away non-loss
- Home O0.5, Away O0.5
- Over 1.5, Over 2.5
- Under 2.5, Under 3.5
- BTTS Yes, BTTS No
- First Half O0.5
- Second Half O0.5
- Draw at Either Half

Straight wins are validation outputs only and require PurePPG or Mismatch confirmation.

## 3. Required league data

- current-season market counts;
- previous-season market counts, if league structure is unchanged;
- rolling last-50 league rate;
- home/away split rates;
- monthly or round-block rates;
- number of teams and fixtures;
- postponed/abandoned match handling;
- team-level relevant venue rates.

Minimum league sample:

- 80 current-season fixtures for full status;
- 50–79 provisional, −5;
- below 50 blocked unless prior-season structure is comparable.

## 4. League-rate shrinkage

```text
Adjusted League Rate =
(Current successes + 40 × Prior League Rate)
÷
(Current matches + 40)
```

When prior season is unusable:

```text
Adjusted League Rate =
(Current successes + 30 × Global Comparable-League Rate)
÷
(Current matches + 30)
```

Mark as provisional.

## 5. Bias Stability Index

Evaluate the market rate in:

- full current season;
- last 50;
- first half versus second half of season;
- home/away split;
- at least three equal round blocks.

```text
Stability Index =
100 − average absolute deviation from Adjusted League Rate
```

Cap at 100.

Requirements:

- standard market: Stability ≥78
- volatile market such as O/U2.5 or BTTS: Stability ≥82
- half market: Stability ≥80

## 6. Dominant league thresholds

| Market | Adjusted league minimum |
|---|---:|
| Over 1.5 | 72% |
| Under 3.5 | 75% |
| Home O0.5 | 75% |
| Away O0.5 | 68% |
| Home non-loss | 72% |
| Away non-loss | 66% |
| First Half O0.5 | 64% |
| Second Half O0.5 | 72% |
| Draw at Either Half | 68% |
| BTTS Yes/No | 58% |
| Over/Under 2.5 | 58% |

A lower-frequency market can still be league-biased if it exceeds comparable leagues by at least 8 percentage points, but its final score must be at least 85.

## 7. Candidate-team filter

Both sides must fit the league bias.

For a market to qualify:

- home relevant venue rate ≥ league threshold;
- away relevant venue counterpart ≥ league threshold;
- harmonic Fixture Fit ≥ market minimum;
- combined recent-10 success count passes;
- neither team strongly contradicts the bias.

Fixture Fit minima:

- O1.5 and U3.5: 78%
- team O0.5: 76%
- non-loss: 74%
- BTTS and O/U2.5: 64%
- half markets: 70%

## 8. Exception Rate

```text
Exception Rate =
Share of teams whose relevant rate is 15+ points below league bias
```

- Exception Rate ≤20%: strong
- 21–30%: −4
- above 30%: market bias blocked

This stops a few extreme teams from inflating the league average.

## 9. Market rules

### Over 1.5

- adjusted league rate ≥72%
- Stability ≥78
- both team venue rates ≥75%
- Fixture Fit ≥77%
- combined recent successes ≥16/20
- Exception Rate ≤25%
- score ≥80

### Under 3.5

- league ≥75%
- Stability ≥80
- both team rates ≥78%
- Fixture Fit ≥80%
- recent successes ≥17/20
- score ≥80

### Team O0.5

Home:

- league home scoring ≥75%
- home scored-at-home ≥80%
- away conceded-away ≥75%
- Fixture Fit ≥78%
- score ≥80

Away requires league away scoring ≥68%, away scoring ≥75%, home conceding ≥72%, Fit ≥75% and score ≥81.

### Home/Away non-loss

- relevant league non-loss threshold passes;
- selected team non-loss rate ≥75%;
- opponent corresponding win rate ≤30%;
- Fit ≥74%;
- PurePPG direction not opposite;
- score ≥81

### BTTS Yes/No

- league rate ≥58%
- Stability ≥82
- both team rates ≥60%
- Fixture Fit ≥63%
- scoring/conceding or FTS/CS counterpart confirms
- score ≥84

### Over/Under 2.5

- league rate ≥58%
- Stability ≥82
- both team rates ≥65%
- Fit ≥67%
- combined recent successes ≥14/20
- score ≥85

### Half markets

Direct half data is mandatory and the Halves Engine must not issue a hard veto.

## 10. Score

```text
League Bias Score =
0.30(Adjusted League Rate)
+ 0.20(Stability Index)
+ 0.25(Fixture Fit)
+ 0.10(Recent Team Fit)
+ 0.10(Low Exception Score)
+ 0.05(Data Quality)
− Penalties
```

## 11. Hard No-Bet gates

- league sample below 50;
- structural rule change or team-count change not handled;
- rolling last-50 rate differs from season by 12+ points;
- Exception Rate above 30%;
- teams do not both fit;
- league trend relies on mixed competitions;
- league bias and direct team trend strongly conflict.

## 12. Vetoes

Hard veto on a market when the league baseline is materially hostile:

```text
Proposed market rate is 12+ points below its required league threshold.
```

Soft veto when the league supports a safer descendant but not the aggressive market.

Example:

```text
Soft veto Over 2.5
Compatible market: Over 1.5
```

## 13. Output requirement

Show current, prior and adjusted league rates, stability, exception rate, fixture fit, team rates, recent fit, score and veto scope.
