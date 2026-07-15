# Predict2U v250 Full Build

This build contains the v249 branded engine pages and top-two/top-three engine ACCAs, plus the v250 GitHub large-file fix.

Key protections:

- API response cache lives in GitHub Actions Cache, not repository history.
- `data.js` is compacted and checked against GitHub's 100 MB hard limit.
- Existing `data.js` browser contract remains `window.MATCHES`.
- No Git LFS requirement is introduced.
