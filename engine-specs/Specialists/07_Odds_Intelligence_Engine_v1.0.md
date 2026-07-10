# Predict2U Odds Intelligence Engine v1.0
## De-Vigged Price Structure, Movement and Cross-Market Consistency Analyzer

## 1. Objective

The Odds Intelligence Engine reads bookmaker information. It does not assume that price movement proves an outcome. Its job is to:

- normalize prices;
- measure market consensus;
- detect movement;
- compare related markets;
- confirm, downgrade or veto a candidate.

It may output one supported market only when a statistical engine already supplies a candidate.

## 2. Required inputs

- opening and current decimal odds;
- timestamp for each snapshot;
- at least four independent bookmakers;
- 1X2 prices;
- relevant DNB or Asian handicap prices;
- relevant totals and BTTS prices;
- overround;
- suspended/stale-price flags;
- exchange or high-liquidity reference, if available.

## 3. Data-quality rules

- fewer than four bookmakers: blocked;
- average 1X2 overround above 10%: −7;
- stale snapshot older than six hours near kickoff: −5;
- one-book movement only: ignored;
- mixed opening times: −4;
- no timestamp: hard veto.

## 4. Fair implied probability

For decimal odds:

```text
Raw probability = 1 / odds
Fair probability = Raw probability / sum(all raw probabilities in market)
```

Use the same snapshot and bookmaker for normalization before aggregating.

Market consensus probability is the median fair probability across books.

## 5. Movement

```text
Probability Movement =
Current fair probability − Opening fair probability
```

Classify:

| Movement | Meaning |
|---:|---|
| 0–1.4 pts | Noise |
| 1.5–2.9 | Mild |
| 3.0–4.9 | Material |
| 5.0+ | Strong |

A material move requires at least 60% of tracked books moving in the same direction.

## 6. Cross-market consistency

For a selected team, award one confirmation point when:

1. 1X2 fair probability rises;
2. DNB or handicap price also strengthens;
3. Double Chance price strengthens or remains consistent;
4. team-goal market supports scoring;
5. opposing team-goal market supports suppression.

For totals:

- O2.5 move should agree with O1.5, BTTS and team totals;
- U2.5 move should agree with U3.5, BTTS-No or team unders.

Consistency:

- 4–5 points: strong
- 3: usable
- 2: mixed
- 0–1: contradiction

## 7. Market support rules

### Result candidate confirmation

- statistical candidate already qualified;
- current fair probability is not 5+ points below model direction;
- at least three cross-market points;
- no material reverse movement;
- bookmaker consensus dispersion ≤5 points;
- score ≥78.

Straight Win requires four cross-market points and score ≥84.

### Goal candidate confirmation

- relevant total moved or remained stable in candidate direction;
- at least two related goal markets agree;
- consensus dispersion ≤6 points;
- score ≥80.

### Price drift warning

If a strong statistical favorite drifts by 3+ fair-probability points across at least 60% of books:

- soft veto Straight Win;
- DNB/DC may remain;
- require another specialist confirmation.

Drift of 5+ points with cross-market contradiction: hard directional veto.

## 8. Trap and disagreement flags

### Favorite compression without support

Favorite shortens materially, but:

- DNB/handicap does not strengthen;
- team total does not strengthen;
- opposing team total does not weaken.

Flag:

```text
Possible isolated compression — no positive confirmation
```

### Total contradiction

O2.5 shortens while BTTS and both team totals weaken, or the reverse.

Output:

```text
No Bet — cross-market total contradiction
```

### Consensus split

Bookmaker fair probabilities differ by more than 8 points.

Output:

```text
No Bet — market consensus unstable
```

## 9. Odds Intelligence Score

```text
Odds IQ Score =
0.25(Market Consensus Quality)
+ 0.25(Cross-Market Consistency)
+ 0.20(Movement Breadth)
+ 0.15(Liquidity/Reference Quality)
+ 0.15(Data Quality)
− Contradiction Penalties
```

This score is not an outcome probability.

## 10. Vetoes

Hard veto:

- timestamps missing;
- consensus split above 8 points;
- 5+ point adverse move with cross-market contradiction;
- stale or suspended market dominates sample;
- candidate price is structurally inconsistent across related markets.

Soft veto:

- 3–4.9 point adverse drift;
- isolated movement;
- high overround;
- downgrade aggressive market.

## 11. Output requirement

Show opening/current fair probabilities, movement, bookmaker breadth, dispersion, cross-market points, contradictions, score and veto scope.
