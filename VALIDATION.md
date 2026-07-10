# Validation Report

The replacement suite was syntax-checked and executed against all 2,276 supplied fixtures.

| Engine | Qualified outputs | Runtime errors |
|---|---:|---:|
| Normal | 193 | 0 |
| Strict | 3 | 0 |
| Ultra | 0 | 0 |
| Elite | 0 | 0 |
| Apex | 0 | 0 |
| Prime | 0 | 0 |
| Expert | 0 | 0 |
| Pro | 0 | 0 |
| Trend | 78 | 0 |
| Streaks | 20 | 0 |
| Mismatch | 3 | 0 |
| Halves | 140 | 0 |
| League Bias | 130 | 0 |
| Momentum | 0 | 0 |
| Odds Intelligence | 0 | 0 |
| Value | 0 | 0 |

Zero-output engines are not broken. Their supplied specifications require fields that the current data snapshot does not contain. Each returns an exact No-Bet reason rather than fabricating the missing input.

The following were also checked:

- all 16 registry functions exist;
- every engine returns the shared browser output contract;
- legacy aliases remain available;
- `board.html` and `engines.html` inline JavaScript parse successfully;
- `sw.js` and `banker-engine.js` pass JavaScript syntax checks;
- a synthetic complete-data fixture activates Normal through Pro and the specialist odds layer.
