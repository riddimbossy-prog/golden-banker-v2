# Predict2U Responsive UI v203

## Purpose
A single all-device responsive foundation for the full Predict2U interface. This release keeps existing page-specific styling and adds a final defensive layer for phones, Galaxy Z Fold cover/open layouts, tablets, laptops, large desktops, landscape screens, safe areas and accessibility preferences.

## Main changes
- Added `responsive-core.css` to every root HTML page as the final stylesheet.
- Added safe-area support for notches, rounded corners and installed PWA mode.
- Added responsive gutters and content limits from 280px phones through 1920px desktops.
- Added Z Fold cover/open and fold/tablet landscape handling.
- Prevented page-level horizontal overflow while preserving intentional horizontal rails and tabs.
- Improved mobile form sizing, tap targets and iPhone input zoom prevention.
- Added responsive tables, drawers, dialogs and bottom-navigation collision protection.
- Added reduced-motion, increased-contrast and print behavior.
- Updated the service-worker cache to `predict2u-v203` and precached the responsive layer.
- Added deterministic responsive checks to Site Quality without restoring the removed Playwright regression step.

## Validation completed
- Responsive static self-test: 56/56 checks passed across 20 HTML pages.
- Browser layout matrix: 200/200 checks passed with no page-level horizontal overflow.
- Tested viewport matrix: 280×653, 320×720, 375×667, 412×915, 540×720, 717×512, 768×1024, 1024×768, 1366×768 and 1920×1080.
- CSS parser: 0 syntax errors.
- Repository preflight: 118 required files found.
- Performance budget: 0 errors, 0 warnings, 34 checks passed.
- PWA readiness: 47 checks passed for v203.

## Deployment
1. Back up the live repository.
2. Copy the supplied changed files or use the full v203 source package.
3. Preserve live-generated `data.js` and `community.js` files if they already exist in the repository.
4. Commit to `main`.
5. Run **Predict2U Site Quality**.
6. Hard refresh the live site and accept the PWA update prompt.
7. Verify the live site on the physical Z Fold cover/open screens, a standard phone and a tablet.

Recommended commit message:

`Build Predict2U v203 all-device responsive UI`
