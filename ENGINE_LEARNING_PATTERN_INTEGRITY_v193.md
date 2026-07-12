# Predict2U v193 — Engine Learning & Pattern Integrity

## Purpose

v193 gives every Predict2U engine a shared post-match learning layer. It reviews settled decisions, classifies why losses happened, builds reliability profiles for teams, leagues, favourite-odds bands and repeated matchups, and applies that evidence before the next prediction is published.

The system is forward-only. It does not rewrite old predictions, hide losses, swap markets after the fact or claim guaranteed outcomes.

## What now happens automatically

1. **Pre-kickoff snapshot** — `track-log.js` records the engine, market, confidence, 1X2 prices, favourite side, odds band, PPG/form inputs and data coverage before kickoff.
2. **Settlement** — the existing score workflow records the final score and actual result.
3. **Post-match review** — `engine-learning.js` classifies every settled loss by likely failure pattern.
4. **Profile rebuild** — team, league, odds-band, matchup and engine-market profiles are rebuilt with recent evidence weighted more heavily.
5. **Future context attachment** — upcoming fixtures receive a compact `learningContext` inside `data.js`.
6. **All-engine review** — `learning-supervisor.js` reviews every engine output through the central `makeOutput()` path in `banker-engine.js`.
7. **Dashboard update** — `engine-learning-report.json` powers the protected Admin → Engine Learning page.

## Teams and competitions the system can flag

### Favourite behaviour

- `FAVORITE_TRAP` — the team has lost too often when priced as the clear favourite.
- `PATTERN_BREAKER` — the team frequently fails to convert favourite status into a win.
- `DRAW_MAGNET_AS_FAVORITE` — the team draws unusually often when favoured.
- `UPSET_RESISTANT` — the team rarely loses when favoured, with a sufficient sample.
- `FAVORITE_RELIABLE` — the team wins frequently as a favourite with a sample-gated lower confidence bound.

### Underdog behaviour

- `DANGEROUS_UNDERDOG` — the team has produced a high rate of outright upsets when priced as the underdog.

### League behaviour

- `VOLATILE_LEAGUE` — favourites lose too often in the league.
- `DRAW_TRAP_LEAGUE` — favourites draw unusually often.
- `FAVORITE_STABLE_LEAGUE` — favourites have a strong non-loss record and a low upset rate.

### Matchup behaviour

- `NO_UPSET_MATCHUP` — repeated comparable meetings have not produced a favourite defeat.
- `VOLATILE_MATCHUP` — repeated comparable meetings have produced frequent favourite defeats.

Low-sample situations are explicitly labelled and cannot trigger strong action.

## Post-match miss causes

The review engine can classify losses as:

- Favourite pattern break
- Draw trap
- Result-direction miss
- Underdog overreach
- Tempo collapse
- Goal spike
- Goal-line miss
- One team failed to score
- Both attacks broke suppression
- Volatile league context
- Known favourite-trap team
- Dangerous underdog context
- Input coverage gap
- Unclassified variance

These causes appear in the Engine Learning dashboard and are counted over time so repeated weaknesses become visible.

## How the supervisor changes future decisions

The supervisor never replaces an engine’s market with another market.

For an already-qualified favourite-backed market:

- Risk score **52–64**: up to `-5` confidence points
- Risk score **65–77**: up to `-9` confidence points
- Risk score **78+**: up to `-14` confidence points
- A hard veto requires stronger evidence: risk 78+, at least 8 favourite-team samples, at least 20 league samples and either a favourite-trap team or dangerous underdog.

For stable, well-sampled contexts:

- Positive adjustment is capped at `+2` points.
- The bonus cannot create a pick that the original engine rejected.

Comparable engine × market × league × odds-band records also contribute:

- Minimum sample: 6
- Weak context: `-4` or `-8`
- Strong validated context: maximum `+2`
- Hard context veto only after 12+ comparable decisions and a Wilson upper bound below 50%

## Anti-overfitting protections

- Forward-only records
- No hindsight market switching
- 120-day evidence half-life
- Minimum sample gates
- Wilson confidence intervals
- Fixture-level deduplication so sixteen engines do not inflate team statistics
- Positive adjustments capped at +2
- One market per engine remains unchanged
- Old evidence fades instead of controlling the model forever

## New Admin page

Open:

```text
https://predict2u.com/admin.html#learning
```

The dashboard shows:

- Settled decisions
- Reviewed losses
- Favourite pattern breakers
- Upset-resistant favourites
- Dangerous underdogs
- Volatile and stable leagues
- Common miss causes
- Recent post-match reviews

## Visible Board and Engine flags

Match cards can show one compact label:

- **Favourite trap** — high-risk or known pattern-break context
- **Pattern watch** — elevated risk that has not reached a hard veto
- **Upset resistant** — low risk with strong stability evidence

Detailed engine reasoning includes the learning adjustment and the evidence used.

## Automatic workflow

The existing live-score workflow now:

1. Updates scores.
2. Settles tracked decisions.
3. Rebuilds the learning ledger.
4. Attaches learning context to upcoming matches.
5. Commits these files:

```text
engine-learning-ledger.json
engine-learning-report.json
data.js
track-log.json
```

The full fixture refresh also rebuilds the ledger after writing `data.js`.

## Installation

1. Extract `Predict2U_Engine_Learning_v193_CHANGED_FILES.zip`.
2. Copy everything into the root of `golden-banker-v2`.
3. Choose **Replace files in destination**.
4. Commit and push:

```text
Install Predict2U v193 Engine Learning and Pattern Integrity
```

5. In GitHub Actions, manually run **Predict2U Live Scores** once.
6. After it completes, open Admin → Engine Learning and press **Refresh**.
7. Hard-refresh the public site once.

## Setup requirements

No new Supabase SQL, Edge Function, VAPID key, API key or GitHub secret is required.

The News workflow included in the full build preserves the repository’s working secret name:

```text
SUPABASE_SECRET_KEY
```

## Important first-run note

Existing `track-log.json` records are used immediately where enough information is available. The most complete favourite, odds-band and input-coverage profiles will grow from v193 onward because new records now store a richer pre-kickoff snapshot.

Small samples remain labelled as learning data. Predictions are analytical records, not guarantees.
