# Predict2U v258 — Home Alerts + Mobile Foundation

## Fixed
- Home/Overview now explicitly loads `smart-alerts.css`.
- Smart Alerts self-loads its own stylesheet when any page forgets it.
- Critical inline layout prevents raw purple notification links while CSS loads.
- Alerts open full-screen on phones and Z Fold cover screens.
- The bottom navigation and slip button stay behind the open alert panel.
- Alert tabs scroll horizontally, cards wrap safely, and buttons remain reachable.
- Repeated “Fresh board applied” notices are collapsed to one current alert.
- Exact duplicate alerts are removed and the notification history is capped at 48 recent items.
- Overview hero, buttons, stats, cards and engine directory resize cleanly from 240 px cover screens through unfolded Z Fold widths.
- Global overflow protection was added for images, forms, tables, code and long text.
- PWA cache version upgraded to v258.

## No data files included
The patch does not contain `data.js`, `fixtures.js`, `track-log.json`, or API cache files.
