# Predict2U v162 — Mobile Test Fix

The Site Quality workflow reached Playwright and exposed two real issues.

## Fixed

1. **Horizontal overflow on 280–360px screens**
   - Overview statistics switch to one column at 360px and below.
   - The long seven-day W/L value can wrap safely.
   - Header logo width is capped on Galaxy Z Fold cover screens.
   - Search, league filters and hero buttons are constrained to the viewport.
   - Onboarding modal descendants are prevented from widening the document.

2. **Brand Experience test failure**
   - Added the missing `#board-rank-reason` host to both `index.html` and `board.html`.
   - The Full Board already contains `#ranked-explainer`.

3. **Better future diagnostics**
   - Playwright still fails on overflow, but now prints the first offending elements instead of only a pixel count.

## Replace

- `brand-experience.css`
- `board.html`
- `index.html`
- `tests/mobile-layout.spec.js`
- `package.json`
- `sw.js`

No API or data refresh is required. Commit the files and start a new Site Quality run.
