# Predict2U v219 — Stable Verified Release

This release preserves the v218 recovery UI and functionality without adding another global visual override.

## Included and verified
- Responsive layouts for desktop, tablets, Samsung Z Fold widths, and phones.
- Full Board logo and header geometry protections.
- Active-engine filtering with the real daily `x/16` counter.
- Today's Board listing picks only from active engines.
- Mobile Acca layout and working **Add All to My Slip** batch action.
- Movable floating My Slip button with persisted position and mobile-navigation clearance.
- News action-button visibility fixes.
- Service-worker cache rollover to `predict2u-v219`.
- Legacy slip regression test updated to validate the current package version instead of hard-coding v212.

Deploy the complete folder contents together. After deployment, reopen the site online once so the v219 service worker can activate.
