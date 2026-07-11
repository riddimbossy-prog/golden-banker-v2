# Predict2U UI Patch v152

## Fixed

- Replaced the temporary P2/text header mark on the Full Board and transparency pages with the real `email-logo.png` logo asset already used on the overview page.
- Fixed the broken Proof page styling by embedding the full shared stylesheet directly into `proof.html`. This prevents the page from rendering unstyled if `intelligence.css` is missing or stale in cache.
- Applied the same self-contained CSS approach to `scorecards.html` and `league-dna.html`.
- Fixed the settled summary tile on `engines.html` so it shows a clean total plus separate W/L figures instead of the cramped `2W0L` layout.
- Changed all LIVE UI states from green to red on:
  - `board.html`
  - `engines.html`
  - `proof.html`
  - `live-refresh.js` floating live badge
- Bumped service worker cache to `predict2u-v152`.

## Replace these files

- `board.html`
- `engines.html`
- `proof.html`
- `scorecards.html`
- `league-dna.html`
- `live-refresh.js`
- `sw.js`

No API rerun is needed for these visual fixes. Deploy the files and refresh once.
