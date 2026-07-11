# Predict2U v155 — Stability & Trust

## New public features

### System-health indicator
Every main page now displays a compact health button showing:

- Core-data freshness
- Live-score freshness
- Engine-registry count
- Loaded fixtures and live fixtures
- Build version and system state

The widget reads `site-health.json` and falls back to the page's current `data.js` globals.

### Trust Center
`trust.html` explains:

- How the 16 engines generate verdicts
- What confidence means
- Why No Bet is returned
- How results are settled
- Data limitations and update delays
- Public forward tracking
- Responsible use

### Automated consistency audit
`audit-site.js` checks:

- Required files
- 16-engine registry
- Old 13-engine wording
- Duplicate HTML IDs
- Broken local links/assets
- Proof Mode wiring
- Service-worker version
- Duplicate fixture keys when `data.js` is available

### Mobile regression tests
Playwright tests widths of 280, 320, 375, 390, 768 and 1440 pixels across all main pages. Tests fail on horizontal overflow, duplicate IDs, missing logo, unavailable health widget or broken Trust Center.

### Deployment gate
`.github/workflows/site-quality.yml` runs the audit and browser tests on pushes and pull requests. The existing live-score workflow now regenerates `site-health.json`, runs the consistency audit and commits the health/audit reports with score changes.

## New files

- `trust.html`
- `site-health-widget.js`
- `site-health.css`
- `generate-site-health.js`
- `audit-site.js`
- `site-health.json`
- `site-audit.json`
- `package.json`
- `playwright.config.js`
- `tests/mobile-layout.spec.js`
- `.github/workflows/site-quality.yml`

## Updated files

- `board.html`
- `engines.html`
- `proof.html`
- `scorecards.html`
- `league-dna.html`
- `community.html`
- `sw.js`
- `.github/workflows/live-scores.yml`

Service-worker cache: `predict2u-v155`.

## Trust/legal pages added

- `responsible-gambling.html`
- `terms.html`
- `privacy.html`
- `disclaimer.html`
- `manifest.webmanifest`
- `icon-192.png`
- `icon-512.png`
