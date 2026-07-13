# Predict2U v205 — Shared Header and Tablet Navigation Repair

This release fixes the header collision visible on Proof Mode, Scorecards, League DNA, Trust Center and legal pages.

## Fixed

- Notification and account controls now mount inside every supported top navigation container instead of floating over page links.
- Proof Mode, Scorecards and League DNA keep their desktop links clear at 1280px and 1366px widths.
- Trust Center uses the same collision-safe header behavior.
- Legal pages keep logo, Trust Center link, notifications and account access within the viewport.
- Tablet and foldable navigation now uses the five fixed bottom tabs through 1180px, including 1024px tablets that previously fell into the desktop breakpoint.
- Desktop header spacing is tightened only between 1181px and 1420px.
- The PWA cache is advanced to v205 so installed apps receive the new stylesheet and scripts.

## Main changed files

- `account-cloud.js`
- `smart-alerts.js`
- `device-responsive-v205.css`
- Public HTML pages loading the responsive layer
- `sw.js`
- `BUILD_VERSION.txt`

## Deployment

Replace the repository files with the full v205 package, commit, deploy, then accept the app update prompt or perform a hard refresh.
