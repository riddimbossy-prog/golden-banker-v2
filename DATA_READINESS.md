# Current Data Readiness

The supplied `data.js` snapshot contains 2,276 fixtures.

| Capability | Current coverage | Effect |
|---|---:|---|
| Explicit recent-ten PPG | 0.0% | Ultra v3+ returns No Bet until supplied |
| Opponent-strength average | 0.0% | Elite v4+ returns No Bet until supplied |
| Model calibration intervals | 0.0% | Prime, Expert and Value cannot qualify |
| Expert context fields | 0.0% | Expert cannot qualify |
| Chronological momentum blocks | 0.0% | Momentum cannot qualify |
| Four-book timestamped odds | 0.0% | Odds Intelligence cannot qualify |
| Direct half data | 9.2% | Halves can operate on supported fixtures |
| League trend data | 33.8% | Trend and League Bias can operate on supported leagues |
| Historical xG profiles | 4.9% | Mismatch may operate where five dimensions exist |

This is intentional. The new engine code returns an exact missing-data reason instead of silently fabricating a statistic or reverting to a weaker rule.

## Recommended new fields

```js
homeRecent10PPG, awayRecent10PPG
homeRecent10Form, awayRecent10Form
homeOpponentAvgPPG, awayOpponentAvgPPG
modelCalibration: {
  "Home Win": { sample, lower, mid, upper, grade, leagueReliability }
}
similarOpponents, rest, fixtureDensity, splitStability
momentum: { home: {...}, away: {...} }
oddsBooks: [
  { bookmaker, timestamp, opening:{home,draw,away}, current:{home,draw,away} }
]
```
