# Predict2U Trend Engine v1.0
## Split-Based, League-Adjusted Market Trend Analyzer

## 1. Objective

The Trend Engine identifies repeatable market behavior across:

- the home team's home matches;
- the away team's away matches;
- the last 5 and last 10 matches;
- the full season;
- the league's current market environment.

It outputs one final market or:

```text
No Bet — insufficient trend agreement
```

A single high percentage is never enough. The relevant home and away tendencies must agree.

## 2. Supported markets

- Home Win, Away Win
- Home DNB, Away DNB
- 1X, X2
- Home O0.5, Away O0.5
- Home U1.5, Away U1.5
- Over 1.5, Over 2.5
- Under 2.5, Under 3.5
- BTTS Yes, BTTS No

Half markets belong to the Halves Engine.

## 3. Required data

For every candidate market:

- home venue success rate and sample;
- away venue success rate and sample;
- last-5 and last-10 success rates;
- full-season rate;
- league rate for the same market;
- the correct opponent counterpart;
- competition type.

Examples:

- Home O0.5 uses home scoring and away conceding.
- 1X uses home non-loss and away non-win.
- BTTS Yes uses both teams' scoring and conceding rates.

## 4. Sample control

| Relevant split sample | Status | Adjustment |
|---:|---|---:|
| 12+ | Strong | +3 |
| 8–11 | Reliable | 0 |
| 6–7 | Limited | −5 |
| Below 6 | Blocked | Market rejected |

Straight wins require at least eight relevant venue matches. Friendlies are blocked.

## 5. Bayesian trend adjustment

```text
Adjusted Trend Rate =
(Market successes + 6 × League market rate)
÷
(Relevant matches + 6)
```

Use the adjusted rate instead of the raw rate.

## 6. Weighted team trend

```text
Weighted Team Trend =
0.40(Adjusted venue split)
+ 0.25(Last 10)
+ 0.20(Last 5)
+ 0.15(Season)
```

Without last-10 data:

```text
0.50(Adjusted venue split)
+ 0.25(Last 5)
+ 0.25(Season)
```

Penalty: −4.

## 7. Fixture agreement

Use the harmonic mean:

```text
Fixture Agreement =
2 × Home Support × Away Support
÷
(Home Support + Away Support)
```

This prevents one extreme team rate from hiding a weak opponent counterpart.

## 8. League edge

```text
League Edge = Fixture Agreement − League Market Rate
```

Normal requirement: at least +5 percentage points.

Straight wins and O/U 2.5 require at least +7 points.

## 9. Continuity and reversal

Continuity bonuses:

- 4/5 recent successes: +4
- 7/10 recent successes: +4
- split and season within 10 points: +3
- both relevant team rates exceed threshold: +4

A reversal exists when last-5 differs from season rate by at least 30 points.

- One reversal: −8
- Two opposing reversals: `No Bet`

## 10. Market thresholds

### Home O0.5

- Home home-scoring trend ≥80%
- Away away-conceding trend ≥75%
- Fixture Agreement ≥78%
- League home-scoring rate ≥70%
- Home scored in at least 4/5

Away O0.5 requires Fixture Agreement ≥80%.

### Team U1.5

Away U1.5:

- Away scored 0–1 in ≥75% of away matches
- Home allowed 0–1 in ≥70% of home matches
- Fixture Agreement ≥74%
- League team-under rate ≥65%

Home U1.5 requires Fixture Agreement ≥76%.

### Over 1.5

- Both relevant split rates ≥75%
- Fixture Agreement ≥77%
- League rate ≥70%
- Recent continuity: one team 5/5, the other at least 4/5

### Under 3.5

- Both split rates ≥78%
- Fixture Agreement ≥80%
- League rate ≥72%
- Both teams at least 4/5 recently
- Block if both O2.5 trends exceed 65%

### Over 2.5

- Both split rates ≥65%
- Fixture Agreement ≥68%
- League rate ≥55%
- Combined recent continuity ≥14/20
- Additional confirmation: both BTTS rates ≥55% or one team's 2+ scoring rate ≥65%
- Final score must be at least 82

### Under 2.5

- Both split rates ≥65%
- Fixture Agreement ≥68%
- League rate ≥55%
- Combined recent continuity ≥14/20
- Additional confirmation: one FTS rate ≥35% or both BTTS-No rates ≥55%
- Final score must be at least 82

### BTTS Yes

- Both venue BTTS rates ≥60%
- Fixture Agreement ≥63%
- League BTTS rate ≥52%
- Both scoring rates ≥70%
- Both conceding rates ≥65%
- Combined recent BTTS successes ≥7/10

### BTTS No

- Both venue BTTS-No rates ≥60%
- Fixture Agreement ≥64%
- League rate ≥50%
- One FTS rate ≥40% or one clean-sheet rate ≥40%

### 1X

- Home home non-loss ≥75%
- Away away-win rate ≤30%
- Fixture Agreement ≥74%
- Home avoided defeat in at least 4/5
- League home non-loss ≥67%

### X2

- Away away non-loss ≥72%
- Home home-win rate ≤35%
- Fixture Agreement ≥72%
- Away avoided defeat in at least 4/5

### Home DNB

- Home home-win ≥55%
- Away away-loss ≥50%
- Home home non-loss ≥75%
- Fixture Agreement ≥58%
- Recent direction agrees

Away DNB uses 50% away-win, 48% home-loss, 72% away non-loss and 56% agreement.

### Home Win

- Home home-win ≥65%
- Away away-loss ≥60%
- Fixture Agreement ≥63%
- Home won at least 4/5
- Away lost at least 3/5
- League home-win rate ≥40%

Away Win uses 60% away-win, 55% home-loss, 58% agreement and the same 4/5 versus 3/5 structure.

## 11. Score

```text
Trend Score =
0.45(Fixture Agreement)
+ 0.20(Recent Continuity)
+ 0.15(League Confirmation)
+ 0.10(Sample Quality)
+ 0.10(Countertrend Confirmation)
```

Penalties:

- limited sample −5
- recent reversal −8
- league contradiction −7
- one-sided trend −6
- cup/playoff −7
- missing last-10 −4
- split/overall disagreement over 25 points −6

## 12. Qualification

- 86–92 Elite Trend
- 82–85 Strong Trend
- 78–81 Qualified
- 74–77 Watchlist
- Below 74 No Bet

Straight wins, O/U 2.5 and BTTS require at least 82.

## 13. Vetoes

Hard veto:

- mixed or insufficient split data;
- strong league contradiction;
- opposing recent and season trends;
- signal depends entirely on one team.

Soft veto:

- aggressive market contradicted by recent continuity;
- safer related market still passes.

## 14. Final output

Return one candidate, full trigger evidence, warnings, data quality, veto and safer-market compatibility.
