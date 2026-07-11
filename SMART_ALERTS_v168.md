# Predict2U v168 — Smart Alerts & Community Win Records

## Included

- Quiet notification bell and unread badge on the main public pages
- Mobile bottom sheet and desktop side panel
- New board-published alerts
- Match status and score-change alerts
- Favorite league and favorite engine awareness from v167 Personalization
- Community winning-slip record alerts
- Verified, trending and followed-user filters
- Read/unread history, mark-all-read and clear-read controls
- Mute for today and Pause all alerts
- Optional browser notifications after explicit permission
- Privacy-first Community records: stake and payout details are removed from alert text
- 18+ “records, not wagers” language
- Phone, tablet, Galaxy Z Fold cover/inner and desktop Playwright coverage

## Community integration

The alert layer works in three ways:

1. It watches the Community feed for settled `.slip-card` records.
2. It listens for a `p2u:community-win` browser event.
3. Community code can call `window.P2USmartAlerts.communityWin(payload)` directly.

Example integration after a slip is settled:

```js
window.P2USmartAlerts?.communityWin({
  id: slip.id,
  user: profile.handle,
  verified: true,
  trending: false,
  following: false,
  league: slip.league,
  engine: slip.engine,
  body: "Public slip settled as won.",
  url: `community.html#${slip.id}`
});
```

Browser notifications work after the user grants permission and while the site is active enough to receive updates. True server push while the site is completely closed requires a later backend push service.

## Deployment

Use the changed-files package over v167. It does not include `data.js`, API keys, generated records or `community.js`.

Suggested commit:

`Install Predict2U v168 Smart Alerts and Community Wins`
