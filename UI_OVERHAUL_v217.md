# Predict2U UI Overhaul v217

## Release goal

v217 replaces the growing collection of one-off mobile repairs with one unified UI layer for phones, tablets, Z Fold/foldables, laptops and desktop displays. It preserves the black-and-green Predict2U identity while improving hierarchy, touch usability, resilience and consistency.

## Main improvements

### Unified UI foundation
- Added `ui-foundation-v217.css` as the shared component and responsive layer.
- Added `ui-experience-v217.js` for common interaction behaviour.
- Added `p2u-utilities-v217.css` so core layouts still work when the Tailwind CDN is unavailable.
- Removed the Google Fonts import from `intelligence.css`; the site now falls back safely to local system fonts.
- Added local SVG icon fallbacks when Font Awesome is blocked or slow.

### Mobile and foldable shell
- Compact sticky header that reduces height after scrolling.
- Safer notch, rounded-corner and home-indicator spacing.
- Refined five-tab bottom navigation with clearer active state and touch targets.
- Dedicated layouts for narrow Fold cover screens, standard phones, tablets and unfolded Fold screens.

### Board
- Compact mobile-first board hierarchy.
- Sticky quick-filter bar and bottom-sheet filters on smaller screens.
- Active-engine denominator now reflects only engines publishing that day.
- Match cards prioritise fixture, market, odds and support.
- Details and Proof remain primary; Share moves to a compact overflow menu.
- Empty, loading and unavailable-data states are designed instead of showing blank areas.

### My Slip
- Movable button snaps to the nearest screen edge.
- Position persists between pages and adapts after rotation or Fold state changes.
- Button becomes smaller during scroll and can be reset from the drawer.
- Drawer remains above the mobile navigation and safe area.

### Acca
- Collapsible risk explanation.
- Mobile leg cards separate fixture, market and odds cleanly.
- **Add All to My Slip is repaired.** The shared single-pick event handler no longer swallows the Acca button.
- Added a true `P2USlip.addMany()` bulk API, duplicate handling, capacity handling and automatic drawer opening.

### News
- Headlines open the source directly.
- Source, Discuss, Read Later and Share stay visible.
- Report moved into a reliable overflow menu.
- Local icon fallback prevents blank buttons.
- Consistent media sizing and mobile card spacing.

### Proof, Scorecards and Community
- Added a Published → Kickoff → Settled proof timeline.
- Added 7-day, 30-day, 90-day and all-time scorecard controls.
- Added matching card, button, sheet and touch behaviour across Community and account-related pages.

### Offline and feedback states
- Offline status banner.
- Shared success/error toasts.
- Reusable empty, error and skeleton states.
- Clear pressed, focus, disabled and loading states.

## Files added
- `ui-foundation-v217.css`
- `ui-experience-v217.js`
- `p2u-utilities-v217.css`
- `acca-add-all-selftest-v217.js`
- `acca-add-all-report-v217.json`

## Release validation
- Repository preflight: 116 checks passed.
- Performance budget: 33 checks passed with 0 warnings.
- PWA readiness: 47 checks passed.
- Active-engine board: 32 checks passed.
- Slip/FAB: 18 checks passed across 320, 344, 393, 768, 884 and 1180 widths.
- News actions: 12 checks passed.
- Acca mobile layout: 23 checks passed.
- Acca Add All: 9 functional/static checks passed.
- JavaScript syntax checks passed for the shared UI and slip modules.

## Deployment
Deploy the full ZIP to the repository root and replace matching files. Open the app online once after deployment so service worker cache `predict2u-v217` activates.
