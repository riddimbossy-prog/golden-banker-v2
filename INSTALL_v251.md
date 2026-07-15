# Install Predict2U v251

## Recommended: apply the patch

Use the v251 patch on the repository that is already running v250. The patch intentionally excludes generated files such as `data.js`, `fixtures.js`, `track-log.json` and all API cache files, so it should not recreate the previous merge conflicts.

1. Stop any data-writing workflow that is currently running.
2. Extract the v251 patch.
3. Copy the patch contents into the clean local repository folder.
4. Choose **Replace files in the destination**.
5. Commit and push with the message: `Install Predict2U v251 odds upgrade`.
6. Run **Predict2U Odds + HTFT Refresh** once.
7. Open `odds-api-coverage.json` in the repository to review provider coverage.
8. Run **Predict2U Fast All Games** normally afterward.

## Full ZIP

The full ZIP is for a fresh clean clone only. Do not copy its generated `data.js` over a repository that has newer live data.

## Secret

The workflow reads exactly:

`ODDS_API_KEY`
