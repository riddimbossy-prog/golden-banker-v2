# Predict2U Transparency Build v150

This release adds the first four standout features as one connected system.

## 1. Proof Mode — `proof.html`

- Permanent fixture URL using `?match=`
- Exact-market support count
- Engine conflict status
- Weighted data-reliability score
- Full 16-engine ledger
- Reasons, warnings and abstentions
- League rate, current odds and odds movement
- Final settlement when scores are available

## 2. Public Engine Scorecards — `scorecards.html`

Reads `track-log.json` and `model-calibration.json`.

- Forward-tracked W/L record
- Last-30-day record
- Recent form
- Best market and best league with minimum samples
- Calibration status
- Learning labels when samples are small

If the JSON files do not exist yet, the page loads safely and shows zero settled
records rather than inventing a performance history.

## 3. League DNA — `league-dna.html`

Built from `data.js` league trends:

- League identity
- Goals per game
- Real sample size
- Data coverage
- Strongest recurring market
- Dangerous low-rate market
- Volatility
- Top-three tendencies
- Best tracked engine when enough settled history exists

## 4. Engine Conflict Detector

Integrated directly into `engines.html`.

Labels:

- Full Agreement
- Exact Agreement
- Strong Agreement
- Split Decision
- Market Conflict
- Data Conflict
- No Bet

The detector compares exact markets and also checks whether markets point in
opposing directions. Every pick card links to its Proof Mode page.

## New files

- `p2u-intelligence.js`
- `intelligence.css`
- `proof.html`
- `scorecards.html`
- `league-dna.html`

## Replaced files

- `engines.html`
- `board.html`
- `community.html`
- `sw.js`

The service-worker cache is `predict2u-v150`.

## Deployment

Upload all five new files and replace the four changed files. Keep the existing
`banker-engine.js`, `data.js`, `track-log.json`, and `model-calibration.json`.

After deployment, refresh once or close and reopen the tab so v150 controls the
page.
