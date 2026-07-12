# Predict2U v197 — News Resilience, Typo-Tolerant Discovery & Share Visibility

## Purpose

v197 repairs the News page so it does not become empty when the database is still using the original v189 News schema. It keeps the newer v192 personalization interface, but automatically falls back to the older stable fields when newer moderation columns are unavailable.

## Main fixes

### 1. Automatic schema fallback

The News board now tries three compatible query levels:

1. Modern v192 schema
2. Original v189 schema
3. Minimal core-story schema

A missing field such as `source_verified`, `canonical_key`, `featured`, `pinned`, or `moderation_status` no longer stops the feed. The page falls back automatically and continues showing available stories.

### 2. Self-populating and cached News board

- Loads the latest published stories automatically
- Refreshes every five minutes
- Listens for new Supabase article inserts
- Stores the latest 180 stories on the device
- Shows cached stories during temporary database or connection failures
- Retries automatically when the connection returns
- Displays a small compatibility or delayed-data notice rather than exposing raw database errors

The News page never exposes messages such as `column ... does not exist` to normal users.

### 3. Typo-tolerant search

Search now handles common typing mistakes and aliases, including examples such as:

- `arsnal` → Arsenal
- `mancester united` → Manchester United
- `PSG` → Paris Saint-Germain
- `Barca` → Barcelona
- `EPL` → Premier League
- `UCL` → Champions League

Matching ignores punctuation, accents, capitalization and small spelling errors. A clear message appears when typo-tolerant matching is being used.

### 4. Safer Follow logic

- Follow names are compared against clubs, leagues, countries, players and publishers already found in the live feed.
- Close spelling mistakes are corrected before saving.
- Follows and Read Later continue working locally when cloud personalization tables or RPCs are not available.
- Signed-in cloud synchronization resumes when the required backend features are available.

### 5. Share button visibility and reliability

- The Share action now always includes the word **Share**, not only an icon.
- Bright Predict2U-green border and high-contrast text make it visible on every card.
- Mobile cards use a two-column action grid so controls do not overlap.
- Native share is used where supported.
- Clipboard fallback works in browsers without `navigator.share`.
- A legacy copy fallback is included when the Clipboard API is blocked.

## Optional database repair

The website works without additional SQL because of the compatibility fallback.

To restore the newer source-verification, pin, feature and moderation fields directly in Supabase, run:

`SUPABASE_NEWS_COMPATIBILITY_v197.sql`

This optional migration is safe to run more than once.

## Installation

Copy the changed-files package into the repository root and replace matching files.

Commit suggestion:

`Install Predict2U v197 News resilience and typo-tolerant discovery`

Then hard-refresh `news.html` after deployment.

## Files changed

- `news.html`
- `news.css`
- `news.js`
- `news-app-v197.js`
- `sw.js`
- `BUILD_VERSION.txt`
- `package.json`
- `tests/news-resilience.spec.js`
- `SUPABASE_NEWS_COMPATIBILITY_v197.sql`
- `NEWS_RESILIENCE_v197.md`
- `VALIDATION_v197.json`
