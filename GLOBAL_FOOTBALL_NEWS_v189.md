# Predict2U v189 — Global Football News, Transfers & Discussion

## What is new

- A fifth global navigation destination: **News**
- A global football news and transfer page at `news.html`
- Responsive latest, transfer, football and breaking filters
- Short source-attributed summaries with links to original publishers
- Signed-in Community comments on every news article
- Real-time comment updates and comment counts
- In-app Smart Alerts for football and transfer news
- Background Web Push preferences for football news and transfer news
- Transfer and breaking-story push jobs generated automatically
- A Supabase Edge Function that synchronizes enabled RSS/Atom sources
- A GitHub Actions workflow that runs the news sync every 20 minutes
- A solid, high-contrast Add to Slip button using official logo green

## Public navigation

The mobile app bar now shows:

`Board · Games · Results · Community · News`

The News tab uses the same phone, tablet, Z Fold cover, Z Fold inner and desktop responsive system as the rest of Predict2U.

## Required Supabase setup

Run `SUPABASE_FOOTBALL_NEWS_v189.sql` after the v180, v181 and v183 SQL files. It creates:

- `p2u_news_sources`
- `p2u_news_articles`
- `p2u_news_comments`
- `p2u_news_post_comment`
- News and transfer push-preference columns
- A trigger that queues transfer and breaking-news push jobs

The SQL includes editable starter RSS sources. A source that fails is skipped and its error is recorded; it does not stop the remaining feeds.

## Edge Function

Deploy the function folder:

`supabase/functions/p2u-news-sync`

Function name:

`p2u-news-sync`

Keep JWT verification enabled and add this custom Edge Function secret:

`NEWS_SYNC_SECRET`

The function uses Supabase's built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets.

## GitHub Actions secret

Add one new repository secret:

`NEWS_SYNC_SECRET`

The workflow reuses the existing:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The secret value must exactly match the Edge Function's `NEWS_SYNC_SECRET`.

## Notification behavior

- Transfer stories and breaking football issues are eligible for background push.
- General football stories remain in the News page and in-app feed to avoid excessive notifications.
- Users can separately switch **Football news** and **Transfer news** on or off in Account Center push preferences.
- Quiet hours continue to apply.

## Comments and moderation

- Only signed-in users can post comments.
- Comments are limited to 600 characters.
- Users may delete their own comments.
- Owners, admins and moderators can review or hide comments through Supabase policies.
- The page displays short summaries only; full reporting remains on the original publisher's website.

## Add to Slip visibility

All Add to Slip buttons now use:

- Background: `#77C41C`
- Text: `#071000`
- Solid two-pixel border
- Strong keyboard focus ring
- Minimum 40-pixel touch height

## Deployment order

1. Install the changed-files ZIP and push it to GitHub.
2. Run `SUPABASE_FOOTBALL_NEWS_v189.sql`.
3. Deploy `p2u-news-sync`.
4. Add the matching `NEWS_SYNC_SECRET` in Supabase and GitHub.
5. Run the **Predict2U Football News Sync** workflow manually once.
6. Open `news.html` and confirm articles appear.
7. Enable Football news and Transfer news in Account Center push preferences.

## Important notes

- RSS feed URLs can change. They are editable in `p2u_news_sources`.
- The feeds and Edge Function were not called from this offline build environment.
- The browser test suite is included for GitHub Actions but was not executed in this sandbox.
