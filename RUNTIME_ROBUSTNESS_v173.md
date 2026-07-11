# Predict2U v173 — Runtime Robustness

This patch fixes the final browser-suite failure from v172.

## Fixes

- Smart Alerts now treats malformed or legacy personalization storage as an empty preference object.
- Community win events are normalized before favorite matching.
- Alert creation is null-safe for incomplete payloads and options.
- Mobile navigation exposes a deterministic readiness signal.
- Playwright waits for that signal instead of relying on script timing.
- Added a regression case for a `null` personalization record.

## Cache

`predict2u-v173`
