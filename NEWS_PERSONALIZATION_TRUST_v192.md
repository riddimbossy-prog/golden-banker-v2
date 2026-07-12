# Predict2U v192 — News Personalization, Trust & Moderation

## Release goal

Turn the global News tab into a personalized football newsroom with trusted sources, Read Later, topic follows, transparent alerts and a real moderation workflow.

## Public News experience

- **For You** feed based on followed clubs, leagues, countries, players, publishers and free-form topics.
- **Most Discussed** ranking using visible comment activity and freshness.
- **Read Later** bookmarks with cloud sync for signed-in accounts and local fallback for signed-out visitors.
- **Duplicate-story grouping** so closely matching headlines are represented by one primary card with a related-story count.
- **Trending ranking** that balances freshness, discussion, breaking status, featured status and pinned editorial priority.
- **Verified-source badges** for reviewed publishers.
- Source name and publication time on every story card.
- Story and comment reporting.
- Better offline, loading, empty and error states.
- Bounded service-worker caching for remote publisher images.
- Mobile, tablet and Z Fold layouts.

## Community safety

- Server-side comment rate limit.
- Duplicate-comment prevention.
- Basic spam and promotion checks.
- Moderation reports for stories and comments.
- Admin actions to feature, pin, mark breaking, hide or restore stories.
- Admin report actions to dismiss or hide the reported target.
- All editorial and report actions are written to the existing admin audit log.

## Notification improvements

Account Center now includes:

- Football news
- Transfer news
- Breaking news
- Followed-topic news

Followed topics are passed to the push dispatcher. The dispatcher records why each alert was eligible, such as:

- `Matches followed topic: Arsenal`
- `Breaking news enabled`
- `Transfer news enabled`

That explanation is included in the background notification and in-app alert.

## Files that require deployment

### Supabase SQL

Run:

`SUPABASE_NEWS_PERSONALIZATION_v192.sql`

Run it after the existing v189 News SQL.

### Edge Functions

Redeploy the existing functions without deleting them:

- `p2u-news-sync`
- `p2u-push-dispatch`

No new secret is required. Existing `NEWS_SYNC_SECRET`, VAPID secrets and `PUSH_DISPATCH_SECRET` remain unchanged.

## Installation order

1. Copy the changed-files package into the repository root and replace matching files.
2. Commit and push the website files.
3. Run `SUPABASE_NEWS_PERSONALIZATION_v192.sql` in Supabase SQL Editor.
4. Redeploy `supabase/functions/p2u-news-sync/index.ts` under `p2u-news-sync`.
5. Redeploy `supabase/functions/p2u-push-dispatch/index.ts` under `p2u-push-dispatch`.
6. Run **Predict2U Football News Sync** once from GitHub Actions.
7. Hard-refresh `news.html`, `account.html` and `admin.html#news-editorial`.

## Service worker

Cache version:

`predict2u-v192`

The News feature bundle is split into a small bootstrap and cached application bundle:

- `news.js`
- `news-app-v192.js`

This keeps the existing performance budget intact while allowing the personalization layer to remain maintainable.
