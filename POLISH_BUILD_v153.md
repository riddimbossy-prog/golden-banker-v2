# Predict2U Polish Build v153

## Included

- Self-contained `predict2u-logo.svg` so the header logo no longer depends on a missing PNG.
- Tighter mobile spacing across Overview, Full Board, Proof, Scorecards, League DNA and Community.
- Stronger red LIVE chips with border, glow and clearer match-clock emphasis.
- Equal-height Top Consensus Banker cards with balanced team, market and action sections.
- Cleaner Proof ledger on desktop and card-style engine rows on mobile.
- More compact settled summary and smaller mobile controls.
- Service worker cache bumped to `predict2u-v153`.

## Add

- `predict2u-logo.svg`

## Replace

- `board.html`
- `engines.html`
- `proof.html`
- `scorecards.html`
- `league-dna.html`
- `community.html`
- `live-refresh.js`
- `sw.js`

No full API update is required. Deploy the files and refresh the site once.

## Official logo update

- Replaced the temporary generated wordmark with the user-supplied official Predict2u.com logo.
- Added transparent optimized assets:
  - `predict2u-logo.png`
  - `predict2u-logo.webp`
- Applied the official logo to Overview, Full Board, Proof, Scorecards, League DNA, and Community.
- Cache version changed to `predict2u-v153-logo1` so browsers do not keep the old logo.
