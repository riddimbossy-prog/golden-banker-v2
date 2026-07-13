# Predict2U v207 — Mobile App Launch Repair

## Problem confirmed from the phone screenshot
The installed app was opening `index.html`, the public overview/landing page. On the affected phone that page was being rendered with a desktop-sized layout and scaled down, so the entire site appeared tiny.

## Repair
- PWA `start_url` now opens `board.html?source=pwa`.
- Removed `window-controls-overlay` from `display_override`; the app now prefers standard standalone mode on phones, tablets and foldables.
- Existing installations that still retain the old `index.html?source=pwa` launch URL are redirected to the responsive Board before the landing page paints.
- Responsive stylesheet and all PWA caches were versioned to v207 so stale v206 layout assets are replaced.

## Scope
No prediction logic, live data, engine rules, comments, or account behavior was changed.
