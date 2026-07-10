# Predict2U Halves Engine v1.0
## First-Half and Second-Half Market Specialist

## 1. Objective

The Halves Engine uses direct half-specific data. Full-match PPG must never be used by itself to generate a half market.

Output one half-related market or:

```text
No Bet — half-specific evidence insufficient
```

## 2. Supported markets

- First Half Over 0.5
- First Half Under 1.5
- First Half 1X or X2
- Home/Away to win either half
- Second Half Over 0.5
- Second Half Over 1.5
- Draw at Either Half
- Draw Both Halves
- Highest-Scoring Half: Second Half, only with direct calibration

## 3. Required inputs

By relevant venue and overall:

- first-half goals for and against;
- second-half goals for and against;
- first-half O0.5 and U1.5 rates;
- second-half O0.5 and O1.5 rates;
- first-half W/D/L;
- second-half W/D/L;
- any-half win/loss rates;
- draw-at-either-half rate;
- draw-both-halves rate;
- scoring by 15-minute interval;
- league half-market rates;
- minimum 10 relevant venue matches for aggressive half markets.

## 4. Bayesian half-rate adjustment

For every half market:

```text
Adjusted Half Rate =
(Successes + 8 × League Half Rate)
÷
(Matches + 8)
```

## 5. Half Agreement

Use the harmonic mean of the two relevant counterparts.

Examples:

- 1H O0.5: home fixture 1H O0.5 rate and away fixture 1H O0.5 rate.
- Home win either half: home any-half-win and away any-half-loss.
- Draw either half: both teams' direct draw-at-either-half rates.

## 6. Time-profile stability

Compare first and second half rates over:

- venue season;
- last 10;
- last 5.

Stable profile: all within 15 percentage points.

- 16–24 point spread: −4
- 25+ point spread: −8
- opposite recent profile: aggressive market blocked

## 7. Market rules

### First Half Over 0.5

- both adjusted 1H O0.5 rates ≥68%
- Half Agreement ≥70%
- league 1H O0.5 ≥62%
- at least one team's 1H scoring rate ≥45%
- corresponding opponent 1H conceding rate ≥45%
- combined last-10 successes ≥14/20
- score ≥81

### First Half Under 1.5

- both adjusted 1H U1.5 rates ≥76%
- Half Agreement ≥78%
- league rate ≥70%
- combined 1H average goals ≤1.25
- no team has a 2+ first-half goal rate above 25%
- score ≥80

### First Half 1X

- home first-half non-loss ≥75%
- away first-half win rate ≤28%
- Half Agreement ≥73%
- home 1H goal difference non-negative
- score ≥80

First Half X2 requires away non-loss ≥72%, home 1H win ≤32% and score ≥81.

### Win Either Half

Home:

- home any-half-win ≥72%
- away any-half-loss ≥62%
- Agreement ≥68%
- home won a half in at least 7/10
- away lost a half in at least 6/10
- score ≥82

Away requires 74%, 64%, Agreement 70% and score ≥83.

### Second Half Over 0.5

- both adjusted 2H O0.5 rates ≥76%
- Agreement ≥78%
- league rate ≥70%
- combined last-10 successes ≥16/20
- at least one team's 2H scoring rate ≥55%
- score ≥80

### Second Half Over 1.5

- both adjusted 2H O1.5 rates ≥58%
- Agreement ≥61%
- league rate ≥48%
- combined 2H average goals ≥1.55
- one 2H scoring rate and counterpart conceding rate each ≥55%
- score ≥85

### Draw at Either Half

- both direct rates ≥72%
- Agreement ≥72%
- league rate ≥65%
- either 1H draw agreement ≥52% or 2H draw agreement ≥50%
- profile stability acceptable
- score ≥82

### Draw Both Halves

This is highly specific and must use the direct market history.

- both direct draw-both-halves rates ≥28%
- Agreement ≥30%
- league rate ≥22%
- both 1H draw rates ≥50%
- both 2H draw rates ≥45%
- combined full-match average goals ≤2.40
- no strong result mismatch
- score ≥87
- maximum displayed confidence 80

### Highest-Scoring Half: Second Half

- both second-half share-of-goals ≥58%
- Agreement ≥60%
- league second-half share ≥55%
- second-half average exceeds first-half average by at least 0.35
- stable across venue, last 10 and season
- score ≥84

## 8. Half-market conflict rules

- 1H O0.5 and 1H U1.5 may coexist; select by score.
- Draw Both Halves conflicts with strong any-half-win signals.
- Second Half O1.5 conflicts with strong U3.5 evidence; if within two points, No Bet.
- Full-time result engines cannot override a Halves hard veto on a half market.

## 9. Score

```text
Halves Score =
0.40(Half Agreement)
+ 0.20(Recent Half Continuity)
+ 0.15(League Half Fit)
+ 0.15(Time-Profile Stability)
+ 0.10(Data Quality)
− Penalties
```

## 10. Hard No-Bet gates

- fewer than eight relevant venue matches;
- mixed full-time and half-time statistics;
- no direct data for the proposed market;
- first/second-half profile reversed by 25+ points recently;
- two incompatible half markets within two score points;
- youth/reserve without league calibration;
- friendly.

## 11. Vetoes

Hard veto applies only to the exact half-market family.

Soft veto may downgrade Second Half O1.5 to Second Half O0.5, or an aggressive half result to First Half Double Chance, provided the safer rule independently passes.

## 12. Output requirement

Show adjusted half rates, half agreement, time-profile stability, league rate, recent continuity, exact half trigger and veto scope.
