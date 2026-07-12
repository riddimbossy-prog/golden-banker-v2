# Predict2U v184 — Visual Identity, Football Assets & Speed

## Delivered
- Official logo green `#77C41C` is now the shared product green across public, account and admin interfaces.
- Team crests and league-country flags are decorated across match, Community, proof, scorecard and league views.
- Real provider artwork is used when available; a branded shield or country fallback is used when an asset is missing.
- Crest/flag images use lazy loading, async decoding and service-worker runtime caching.
- The settled-win carousel was slowed from 40 seconds to a minimum of 96 seconds, scales with item count, pauses on interaction and respects reduced-motion preferences.
- Below-the-fold cards use `content-visibility` where supported for faster mobile rendering.
- Added image CDN preconnect/dns-prefetch hints.

## Installation
Use the changed-files ZIP on top of v183. It does not include or replace `data.js`, `community.js`, API keys, Supabase secrets or generated records.

## Cache
`predict2u-v184`
