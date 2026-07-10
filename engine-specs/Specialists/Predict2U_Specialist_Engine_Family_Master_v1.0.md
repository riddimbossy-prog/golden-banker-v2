# Predict2U Specialist Engine Family — Complete Master v1.0


---

# Predict2U Specialist Engine Family v1.0

This package contains eight specialist football-analysis engines and one consensus integration layer.

## Engines

| No. | Engine | Core job |
|---:|---|---|
| 1 | Trend | Finds persistent market tendencies across venue, recent, season and league windows |
| 2 | Streaks | Measures active sequences and verifies whether they are supported or fragile |
| 3 | Mismatch | Detects multi-dimensional quality gaps between opponents |
| 4 | Halves | Analyzes first-half and second-half behavior using half-specific data |
| 5 | League Bias | Finds markets structurally favored by a league, then filters suitable teams |
| 6 | Momentum | Measures improvement, decline, acceleration and reversals |
| 7 | Odds Intelligence | Reads normalized prices, movement and cross-market consistency |
| 8 | Value | Compares calibrated model probability with fair market probability |
| 9 | Pro Consensus Integration | Combines the specialist outputs with the PurePPG Pro engine |

## Shared principles

- One engine output equals one candidate market or `No Bet`.
- Every engine evaluates all supported markets before selecting.
- No engine may invent missing statistics.
- Venue splits must remain separate from overall statistics.
- Small samples are penalized or blocked.
- Every selection includes the exact trigger, warnings, data quality and veto status.
- A specialist score is a reliability score, not a guaranteed probability.
- Outputs are intended for statistical analysis and simulation. Never describe a result as certain or guaranteed.

## Shared specialist output contract

```text
ENGINE:
VERSION:
FIXTURE:
CANDIDATE MARKET:
MARKET FAMILY:
DIRECTION:
SPECIALIST SCORE:
DATA QUALITY:
SIGNAL STRENGTH:
EXACT TRIGGERS:
WARNINGS:
VETO: NONE | SOFT | HARD
VETO SCOPE:
COMPATIBLE SAFER MARKETS:
FINAL STATUS: QUALIFIED | WATCHLIST | NO BET
```

See `09_Pro_Consensus_Integration_v1.0.md` for the final consensus rules.


---

# Specialist Family Architecture v1.0

## 1. Purpose

The specialist family sits beside the main PurePPG ladder:

`Normal → Strict → Ultra → Elite → Apex → Prime → Expert → Pro`

The version ladder controls general strictness. The specialist family studies one particular kind of signal deeply.

## 2. Universal scoring bands

| Score | Classification |
|---:|---|
| 88–92 | Prime specialist signal |
| 84–87 | Elite specialist signal |
| 81–83 | Strong specialist signal |
| 78–80 | Qualified specialist signal |
| 74–77 | Watchlist only |
| Below 74 | No Bet |

Maximum displayed specialist score is 92.

## 3. Universal data-quality bands

| Data quality | Meaning |
|---:|---|
| 88–100 | Excellent |
| 80–87 | Strong |
| 72–79 | Usable |
| 65–71 | Weak |
| Below 65 | Blocked |

An official specialist selection normally requires data quality of at least 72. Straight wins, half markets and value selections may impose higher limits.

## 4. Veto levels

### NONE
The engine found no material contradiction.

### SOFT
The aggressive market is blocked, but a safer related market may remain eligible.

Example:

```text
Soft veto: Home Win
Compatible safer markets: Home DNB, 1X
```

### HARD
The exact market family or fixture must not be used by the Pro consensus layer.

Examples:

- contaminated or mixed data;
- major market contradiction;
- insufficient direct half data for a half market;
- uncalibrated probability for a Value selection;
- opposing high-strength specialist signals.

## 5. Market families

- `HOME_RESULT`: Home Win, Home DNB, 1X
- `AWAY_RESULT`: Away Win, Away DNB, X2
- `HOME_SCORING`: Home O0.5, Home O1.5
- `AWAY_SCORING`: Away O0.5, Away O1.5
- `HOME_SUPPRESSION`: Home U1.5
- `AWAY_SUPPRESSION`: Away U1.5
- `MATCH_OVER`: Over 1.5, Over 2.5
- `MATCH_UNDER`: Under 2.5, Under 3.5
- `BTTS_YES`
- `BTTS_NO`
- `FIRST_HALF`
- `SECOND_HALF`
- `DRAW_STRUCTURE`

## 6. Safer-market ladders

Home direction:

```text
Home Win → Home DNB → 1X → Home O0.5 → No Bet
```

Away direction:

```text
Away Win → Away DNB → X2 → Away O0.5 → No Bet
```

Goal aggression:

```text
Over 2.5 → Over 1.5 → No Bet
```

Goal suppression:

```text
Under 2.5 → Under 3.5 → No Bet
```

A specialist may downgrade only when the safer market passes its own minimum evidence rules.

## 7. Universal hard No-Bet conditions

- Future or post-match data contamination
- Mixed home/away splits presented as venue data
- Duplicate fixtures affecting percentages
- Impossible rates or sample counts
- Friendly match unless the engine explicitly supports friendlies
- No supported market reaches its threshold
- Two incompatible candidate markets finish within two points and conflict cannot be resolved
- Evidence depends entirely on one team when the market requires two-sided confirmation


---

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


---

# Predict2U Streaks Engine v1.0
## Active-Sequence, Recurrence and Counter-Streak Analyzer

## 1. Objective

The Streaks Engine detects active sequences, but it does not assume a streak must continue or is "due" to end. A streak qualifies only when:

- it is long enough;
- the same behavior appears beyond the active run;
- the opponent supplies the correct counterpart;
- the league environment supports the market.

Output one market or:

```text
No Bet — streak not sufficiently supported
```

## 2. Supported markets

- Home/away O0.5 team goals
- Home/away O1.5 team goals
- Over 1.5, Over 2.5, Under 3.5
- BTTS Yes, BTTS No
- Home/away Win, DNB, 1X, X2
- Favorite to win either half

## 3. Required inputs

- current consecutive streak length;
- current venue streak length;
- success count in last 10 and last 15;
- number of separate runs of at least three in the season;
- date and result of the most recent break;
- opponent counter-streak;
- league market rate;
- competition type and venue sample.

## 4. Streak definitions

- `Active Length`: consecutive current successes.
- `Venue Length`: consecutive successes at the relevant venue.
- `Recurrence Rate`: season successes ÷ season matches.
- `Run Repeat Count`: number of separate qualifying runs.
- `Counter-Streak`: opponent sequence that supports the same market.
- `Break Risk`: number of failures in the last 5 outside the active run.

## 5. Streak Reliability Index

Convert each component to 0–100:

```text
Streak Reliability =
0.25(Active Length Score)
+ 0.20(Venue Length Score)
+ 0.20(Recurrence Rate)
+ 0.15(Opponent Counter-Streak)
+ 0.10(League Confirmation)
+ 0.10(Run Repeat Score)
```

Length score guide:

| Active length | Score |
|---:|---:|
| 3 | 55 |
| 4 | 65 |
| 5 | 75 |
| 6 | 82 |
| 7 | 87 |
| 8+ | 92 |

An active sequence of three is never enough by itself.

## 6. Fragility controls

Apply:

- first occurrence of such a run this season: −5
- two failures immediately before the run: −4
- streak created mostly against bottom-quarter opponents: −6
- opponent counter-streak below 55%: −8
- no venue confirmation: −5
- last-10 rate below 70%: aggressive market blocked
- active run broken in the latest match: streak is inactive

## 7. Market rules

### Team O0.5

- active scoring streak ≥5
- relevant venue scoring streak ≥4
- scored in at least 8/10
- opponent conceding streak ≥4
- opponent conceded in at least 7/10
- league team-scoring rate ≥68%
- Reliability ≥78

### Team O1.5

- 2+ scoring streak ≥3
- 2+ venue rate ≥60%
- at least 6/10 scored 2+
- opponent conceded 2+ in at least 6/10
- opponent current 2+ concession streak ≥3
- league 2+ team-goal rate ≥42%
- Reliability ≥84

### Over 1.5

- active O1.5 streak for both teams ≥4, or one ≥6 and the other ≥3
- each last-10 O1.5 rate ≥75%
- combined successes ≥16/20
- league O1.5 ≥70%
- Reliability ≥80

### Over 2.5

- both active O2.5 streaks ≥3
- each last-10 rate ≥60%
- combined successes ≥13/20
- at least one BTTS or 2+ team-goal supporting streak
- league O2.5 ≥53%
- Reliability ≥84

### Under 3.5

- both active U3.5 streaks ≥5
- each last-10 rate ≥80%
- combined successes ≥17/20
- league U3.5 ≥70%
- no team currently has a 3+ scoring streak of three or more
- Reliability ≥80

### BTTS Yes

- both teams currently scored and conceded in at least 3 consecutive matches
- each BTTS last-10 rate ≥60%
- combined BTTS successes ≥13/20
- league BTTS ≥50%
- Reliability ≥84

### BTTS No

- at least one team has an FTS or clean-sheet streak ≥3
- both teams' BTTS-No last-10 rates ≥60%
- opponent counterpart supports the same outcome
- league BTTS-No ≥48%
- Reliability ≥84

### 1X

- home unbeaten streak ≥6
- home venue unbeaten streak ≥4
- away winless streak ≥4
- home non-loss in at least 8/10
- away failed to win at least 7/10
- Reliability ≥80

### X2

- away unbeaten streak ≥6
- away venue unbeaten streak ≥4
- home winless streak ≥4
- away non-loss in at least 8/10
- Reliability ≥82

### DNB

- selected team unbeaten streak ≥6
- selected team won at least 5/10
- opponent winless streak ≥4
- opponent lost at least 4/10
- selected side's venue pattern agrees
- Reliability ≥84

### Straight Win

- selected team win streak ≥4
- relevant venue win streak ≥3
- opponent loss streak ≥3
- selected team won at least 7/10
- opponent lost at least 6/10
- Mismatch or PurePPG directional confirmation required
- Reliability ≥87

### Win Either Half

- selected team won at least one half in ≥75% of relevant matches
- active any-half-win streak ≥5
- opponent lost at least one half in ≥65%
- active opponent any-half-loss streak ≥4
- Reliability ≥82

## 8. Streak exhaustion warning

The engine does not claim a streak is due to stop. It may flag exhaustion only when objective support is weakening:

- active length is high but last-10 recurrence is below 70%;
- opponent counterpart has recently reversed;
- current run was created by unusually weak opposition;
- underlying supporting rate declined in three consecutive rolling windows.

Exhaustion warning: −7 and aggressive markets blocked.

## 9. Score and qualification

```text
Streak Score =
0.55(Streak Reliability)
+ 0.15(Data Quality)
+ 0.15(Opponent Fit)
+ 0.15(League Fit)
− Penalties
```

- 86–92 Elite Streak
- 82–85 Strong Streak
- 78–81 Qualified
- 74–77 Watchlist
- Below 74 No Bet

## 10. Vetoes

Hard veto:

- latest match broke the claimed active streak;
- counter-streak points in the opposite direction;
- streak exists only in mixed venue data;
- active sequence has fewer than three matches.

Soft veto:

- sequence is valid but recurrence or opponent fit is weak;
- aggressive market blocked, safer descendant may qualify.

## 11. Output requirement

Include active length, venue length, last-10/15 recurrence, opponent counter-streak, league rate, fragility warnings and veto scope.


---

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


---

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


---

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


---

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


---

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


---

# Predict2U Value Engine v1.0
## Calibrated Probability, Fair Price and Risk-Adjusted Edge Analyzer

## 1. Objective

The Value Engine does not create probabilities from raw scores. It receives calibrated market probabilities from validated models and compares them with de-vigged market prices.

Output one positive-value market or:

```text
No Bet — insufficient calibrated value
```

## 2. Required inputs

- exact market and settlement rules;
- calibrated model probability;
- lower and upper probability bounds;
- calibration sample size;
- Brier score or calibration error;
- current decimal odds from at least four books;
- de-vigged fair market probability;
- liquidity/market-quality flag;
- correlation with other proposed selections.

## 3. Mandatory calibration

Each market must have its own calibration.

Minimum settled historical selections:

- 300 for provisional use;
- 750 for standard use;
- 1,500 preferred.

Before 300:

```text
Hard veto — probability not sufficiently calibrated
```

Do not use Home Win calibration for DNB, Double Chance or team goals.

## 4. Fair market probability

Normalize each bookmaker market separately.

```text
Raw implied probability = 1 / decimal odds
Fair probability = raw probability / market raw-probability sum
```

Aggregate using the median fair probability.

For three-way markets, multiplicative normalization is the default. A calibrated Shin adjustment may be used consistently, but methods must not be mixed inside one comparison.

## 5. Conservative model probability

```text
Conservative Probability = Lower Bound of Model Interval
```

Never use the midpoint for the value gate.

## 6. Value metrics

```text
Probability Edge =
Conservative Probability − Fair Market Probability
```

```text
Expected Value =
(Model Midpoint Probability × Decimal Odds) − 1
```

```text
Conservative EV =
(Conservative Probability × Decimal Odds) − 1
```

Both Probability Edge and Conservative EV must be positive.

## 7. Minimum gates

| Market | Min probability edge | Min conservative EV |
|---|---:|---:|
| Home Win | +4 pts | +3% |
| Away Win | +5 pts | +4% |
| DNB | +4 pts | +3% |
| Double Chance | +3 pts | +2% |
| Team O0.5/U1.5 | +4 pts | +3% |
| O/U1.5 or 3.5 | +4 pts | +3% |
| O/U2.5 or BTTS | +5 pts | +4% |
| Half markets | +6 pts | +5% |

The Value Engine may raise these thresholds for volatile leagues.

## 8. Price and market limits

Default decimal-odds band:

```text
1.15 to 3.00
```

Outside this band, the market is blocked unless separately calibrated.

Additional blocks:

- overround above 10%;
- bookmaker dispersion above 7 fair-probability points;
- stale price;
- suspended or thin market;
- probability interval width above 18 points;
- model decay warning.

## 9. Risk-Adjusted Value Score

Convert components to 0–100:

```text
Value Score =
0.30(Probability Edge Quality)
+ 0.20(Conservative EV Quality)
+ 0.20(Calibration Quality)
+ 0.10(Interval Tightness)
+ 0.10(Market Quality)
+ 0.10(Cross-Model Agreement)
```

Penalties:

- provisional calibration −6
- volatile league −5
- odds movement against candidate −4
- specialist conflict −8
- interval width 14–18 points −5
- closing-line underperformance warning −6

## 10. Market selection

Evaluate every candidate market supplied by the other engines.

Select the market with the highest Risk-Adjusted Value Score, not necessarily the highest raw EV.

Tie rule within two points:

1. tighter probability interval;
2. higher data quality;
3. safer settlement structure;
4. lower model disagreement.

No correlated double selections from the same fixture.

## 11. Calibration health

Track:

- Brier score;
- log loss;
- expected calibration error;
- strike rate by probability band;
- closing-line value;
- ROI by league and market;
- last 50, 100 and 250 selections.

Suspend a market model when recent calibration error worsens materially or last-100 performance falls 12 percentage points below long-term expectation.

## 12. Vetoes

Hard veto:

- no calibrated probability;
- calibration sample below 300;
- lower probability bound does not clear fair price;
- conservative EV is non-positive;
- market settlement differs from model target;
- severe model decay.

Soft veto:

- positive midpoint EV but insufficient conservative edge;
- compatible candidate remains statistical only, not value-qualified.

## 13. Output requirement

Show model midpoint and interval, conservative probability, fair market probability, probability edge, EV, conservative EV, calibration sample, calibration health, Value Score and veto scope.


---

# Predict2U Pro Consensus Integration v1.0
## PurePPG Pro + Specialist Engine Decision Layer

## 1. Objective

The consensus layer combines:

- PurePPG Pro
- Trend
- Streaks
- Mismatch
- Halves
- League Bias
- Momentum
- Odds Intelligence
- Value

It outputs one final market or:

```text
No Bet — consensus requirements not met
```

No simple average is allowed.

## 2. Domain ownership

Certain markets require the relevant specialist:

| Market type | Required domain owner |
|---|---|
| First/Second-half markets | Halves |
| League-bias label | League Bias |
| Value-qualified label | Value |
| Odds-confirmed label | Odds Intelligence |
| Straight result mismatch | PurePPG or Mismatch |
| Active streak claim | Streaks |
| Trend claim | Trend |

A half market cannot qualify without Halves approval. A market cannot be called positive value without Value approval.

## 3. Standard engine message

Every engine must return:

```text
candidate_market
market_family
direction
score
data_quality
status
veto_level
veto_scope
exact_triggers
warnings
compatible_safer_markets
```

Missing required fields make the engine output unusable.

## 4. Agreement types

### Exact-market agreement
Same exact market.

Examples:

- Trend: O1.5
- League Bias: O1.5
- Value: O1.5

### Directional agreement
Related markets support the same side.

Example:

- Home Win
- Home DNB
- 1X
- Home O0.5

### Family agreement
Markets support the same goal family.

Example:

- O2.5
- O1.5
- BTTS Yes

Family agreement is weaker than exact-market agreement.

## 5. Default evidence weights

These are starting weights and must be backtested:

| Engine | Weight |
|---|---:|
| PurePPG Pro | 1.20 |
| Mismatch | 1.10 |
| Trend | 1.00 |
| Halves | 1.00 within half domain |
| League Bias | 0.90 |
| Streaks | 0.85 |
| Momentum | 0.85 |
| Odds Intelligence | 1.00 |
| Value | 1.15 |

A specialist with data quality below 72 contributes no positive weight.

## 6. Consensus Support

For each candidate:

```text
Engine Support =
Weight × ((Score − 70) / 22)
```

Only Qualified or stronger outputs count positively.

Total support is the sum of positive Engine Support values.

A Watchlist output contributes zero, but its warning remains visible.

## 7. Qualification paths

### Path A: Exact-market consensus

- at least three qualified engines support the exact market;
- one must be a domain owner where applicable;
- combined support ≥2.20;
- no hard veto;
- at most one soft veto;
- PurePPG/Trend/Mismatch direction is not opposite.

### Path B: Directional consensus

- at least four engines support the same direction;
- at least two exact-market supporters for the selected safer market;
- combined directional support ≥3.00;
- choose the safest market independently passing its own rules;
- no hard directional veto.

### Path C: Specialist-domain consensus

For half or league-specific markets:

- domain owner score ≥84;
- at least two additional engines support the same family;
- Value passes when a value label is requested;
- Odds Intelligence has no hard veto;
- combined support ≥2.50.

## 8. Veto handling

### Hard veto

A hard veto blocks only its stated scope.

Examples:

- Halves hard veto blocks the half market, not a full-time DNB.
- Value hard veto blocks the value label, not the statistical candidate.
- Odds hard veto may block the exact price-dependent market.
- Data contamination hard veto blocks the fixture entirely.

Two independent hard vetoes on the same direction:

```text
No Bet
```

### Soft veto

One soft veto requires downgrade or an additional qualified supporter.

Two soft vetoes on the same market:

```text
Aggressive market blocked
```

Evaluate the safer descendant.

## 9. Conflict rules

- Strong home and strong away directional support: No Bet.
- Over and Under family support within two consensus points: No Bet.
- BTTS Yes and No both receive strong support: No Bet.
- Straight Win cannot beat DNB unless its exact support exceeds DNB by at least 0.50 consensus points.
- Aggressive goal market cannot beat safer line unless its Value and domain-owner support are both stronger.

## 10. Final market hierarchy

For close candidates within 0.35 consensus points:

1. Double Chance
2. DNB
3. Team O0.5
4. Team U1.5
5. O1.5 or U3.5
6. Half O0.5/U1.5
7. O/U2.5 or BTTS
8. Straight Win
9. Highly specific half markets

This hierarchy applies only when each market independently qualifies.

## 11. Final Pro score

```text
Pro Score =
0.45(Consensus Strength)
+ 0.20(Average Data Quality)
+ 0.15(Exact-Market Agreement)
+ 0.10(Domain-Owner Strength)
+ 0.10(Value/Odds Validation)
− Veto and Conflict Penalties
```

Normalize to 0–92.

Official output requires:

- Pro Score ≥82
- average data quality ≥78
- no hard veto
- at least one exact-market agreement beyond the primary engine

Prime label requires score ≥88 and Value qualification.

## 12. Final output

```text
FINAL MARKET:
PRO SCORE:
CONSENSUS TYPE:
EXACT SUPPORTERS:
DIRECTIONAL SUPPORTERS:
DOMAIN OWNER:
VALUE STATUS:
ODDS STATUS:
HARD VETOES:
SOFT VETOES:
DOWNGRADES:
EXACT REASON:
FINAL STATUS:
```

## 13. No-Bet reasons

- insufficient exact-market agreement;
- specialist conflict;
- opposing directional support;
- domain owner rejected market;
- hard veto;
- data quality too low;
- no safer descendant passes;
- uncalibrated value model;
- odds contradiction;
- Pro Score below 82.
