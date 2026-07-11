# ADVANCED DATA FIX — v149

This build adds the data fields the higher engines were waiting for.

## What is now calculated automatically from API-Football

`fetch-data.js` now derives these fields from each team’s real chronological
league fixtures before the target kickoff:

- `homeRecent10PPG` / `awayRecent10PPG`
- `homeRecent10Form` / `awayRecent10Form`
- `homeOpponentAvgPPG` / `awayOpponentAvgPPG`
- `homeSimilarOpponentPPG` / `awaySimilarOpponentPPG`
- `homeRestDays` / `awayRestDays`
- `fixtureDensity.home/away`
- `homeSplitBlockDifference` / `awaySplitBlockDifference`
- `splitStability.home/away`
- `momentum.home/away`
- `seasonPhase`

The source fixtures are restricted to the same league and to games completed
before the match being analysed. Opponent strength uses the current league table.
Every block includes sample counts. Missing samples remain `null`.

## Model calibration

`track-log.js` now snapshots:

- engine and engine version
- market
- confidence
- odds at pick time
- fair market probability at pick time
- final Won/Lost result

`model-calibration.js` builds Wilson probability intervals from forward-tracked
results. It attaches `modelCalibration` and `modelProbabilities` only when a
comparable group reaches **300 settled selections**.

This means Prime and Value do not unlock immediately. They unlock honestly as
Predict2U accumulates enough forward evidence.

Run:

```bash
node track-log.js
node attach-calibration.js
```

`track-log.js` already calls the attachment automatically; the second command is
provided for manual recovery.

## Multi-book odds

`enrich-xg.js` now stores every valid bookmaker returned by TheStatsAPI:

```js
oddsBooks: [{
  bookmaker,
  timestamp,
  timestampSource,
  opening: {home,draw,away},
  current: {home,draw,away}
}]
```

Odds Intelligence requires four valid books. A retrieval timestamp is marked
`timestampSource: "retrieved"` when the vendor does not supply its own timestamp.

Run after the normal fetch:

```bash
node enrich-xg.js
```

## Shots on target

A new optional collector is included:

```bash
node enrich-sot.js
```

It uses API-Football’s per-fixture statistics endpoint and maintains
`sot-history.json`. Because this costs one extra API request per historical
fixture, the collector enforces a hard budget.

Add or keep these settings in `config.txt`:

```ini
SOT_LOOKBACK=8
SOT_CALL_BUDGET=120
SOT_SLEEP_MS=250
```

It attaches:

- `homeSOTFor`, `homeSOTAgainst`
- `awaySOTFor`, `awaySOTAgainst`
- recent-five SOT averages
- `homeProfile.sotFor/sotAg`
- `awayProfile.sotFor/sotAg`

## Recommended daily order

```bash
node fetch-data.js
node enrich-xg.js
node enrich-sot.js
node track-log.js
node fetch-scores.js
```

For frequent score updates, keep using `fetch-scores.js`; it refreshes profiles
and model calibration without refetching full fixture statistics.

## Important expectation

The code path is now fixed, but sample-gated engines will still return No Bet
until enough real evidence exists:

- Recent-10 and Momentum: usually available after eight league matches
- Similar-opponent PPG: needs at least three comparable opponents
- Split stability: needs at least six relevant venue matches
- Odds Intelligence: needs four timestamped books
- Prime/Value calibration: needs 300 settled forward selections per usable group
- SOT profiles: need at least three collected matches, preferably four in the
  relevant home/away split

No threshold was bypassed and no missing statistic was fabricated.
