# Predict2U Audit Fix v160

The Site Quality audit was blocked by two stale assumptions:

1. `audit-site.js` expected a specific old service-worker cache version.
2. The Trust page referenced `intelligence.css`, but that stylesheet was not present in the committed repository snapshot.

## Fixes

- The audit now reads the actual `CACHE_VERSION` from `sw.js`.
- Future valid `predict2u-v...` cache versions pass without editing the audit.
- `intelligence.css` and `site-health.css` are explicit required files.
- Missing local CSS or JavaScript references are critical errors.
- The workflow verifies shared UI files before running the audit.
- The workflow uses Node 24.

## Commit these files

- `.github/workflows/site-quality.yml`
- `audit-site.js`
- `package.json`
- `intelligence.css`
- `site-health.css`

Start a new Site Quality run after committing. Re-running the old failed job uses the old commit.
