# Predict2U v210 — Active Engine Board

## Behaviour

- An engine is active for a selected date only when it publishes at least one qualified pick (`bet: true`).
- The overview counter displays the real daily count, such as `3/16`.
- Inactive engine pills and inactive engine cards are hidden for the selected date.
- The Full Board engine filter also lists only active engines.
- Today’s Board includes every qualified exact-market pick produced by the active engines.
- Matching fixture/market outputs are merged into one card and show all supporting engines.
- Today’s Board is no longer limited to eight cards and no longer redirects to Full Board when opened.
- Today’s Acca remains restricted to consensus banker selections.

## Date changes

Changing the date recalculates active engines, pills, cards, statistics and the active-engine section. If a selected engine has no pick on the new date, the view safely returns to All Active Engines.
