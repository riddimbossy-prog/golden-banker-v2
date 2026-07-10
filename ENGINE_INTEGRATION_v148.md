# Predict2U Engine Integration v148

This build keeps the 16-engine family from v147 and updates the remaining
repository scripts that still contained the retired hardcoded engine list.

## Dynamic registry

The following files now read `P2U_ENGINE_REGISTRY` from `banker-engine.js`:

- generate-acca.js
- generate-image.js
- generate-results.js
- generate-social-card.js
- track-log.js

This means future engine renames or additions can be made in one registry
instead of editing five separate arrays.

## Important fixes

- Normal and Strict are no longer called through the obsolete
  `analyseAll(...).results` / `analyseStrict(...).results` contract.
- Expert, League Bias, Momentum and Odds Intelligence are now included.
- ACCA agreement counts only engines supporting the exact same market.
- New 0–100 engine scores are converted correctly to a 0–10 ACCA rating.
- Half-time and second-half markets settle with the full match object in
  generate-results.js and track-log.js.
- Community wording now says 16 engines.
- Service-worker cache is predict2u-v148.

## Files not logically changed

Data collection, Supabase settlement, email delivery, social posting,
configuration, league lookup and probes remain intact. They were included in
the package so the repository update is complete.

Advanced engines deliberately return No Bet when their mandatory calibration,
recent-ten, opponent-strength or line-movement fields are unavailable. No
missing statistics are fabricated.
