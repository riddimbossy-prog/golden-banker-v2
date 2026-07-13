# Predict2U v206 — Phone Opening Repair

## Fixed
- Engine filter labels no longer shrink into each other on narrow phones.
- Engine filters remain a smooth horizontal rail with full readable labels.
- The date rail no longer auto-centers Today by clipping the first visible card beyond the left edge.
- Board anchor navigation and restored hashes now clear the sticky header.
- The freshness line remains visible below the header.
- The repair applies to standard phones, Z Fold cover displays, unfolded Fold screens and tablets.

## Deployment
Deploy the full package or copy the changed files into the repository root. The service worker cache is now `predict2u-v206`, so installed PWAs receive the corrected responsive stylesheet.
