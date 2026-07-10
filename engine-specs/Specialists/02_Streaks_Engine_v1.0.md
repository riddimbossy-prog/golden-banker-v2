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
