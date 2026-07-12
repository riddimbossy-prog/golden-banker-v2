# Predict2U v198 — Reliability, System Health & News Discussion Repair

## Main repair

News comments now work on both the original v189 News schema and the newer v192 personalization schema. The old comment RPC directly referenced the optional `moderation_status` column. When that column was not installed, posting failed even though stories loaded through compatibility mode.

v198 replaces that RPC with a schema-tolerant version that:

- accepts signed-in members only;
- checks that the article exists and is published;
- reads optional moderation fields through JSON rather than a hard column reference;
- keeps duplicate, rate-limit and spam checks;
- records the member handle safely;
- updates article comment counts;
- works with the old and new News database layouts.

The browser discussion panel also now:

- refreshes the active Supabase session before posting;
- prevents accidental double submission;
- shows readable error messages instead of raw database errors;
- supports Ctrl+Enter or Command+Enter;
- retries comment reads without the optional `status` field when required;
- keeps the discussion panel open after posting.

## System Health

A new **System Health** tab is added to Backend Admin. It checks:

- Board settings;
- News articles;
- News comments;
- comment-posting RPC;
- Push queue;
- Admin roles;
- Product Analytics;
- public Board, News, Community and Account routes;
- service worker and the active News bundle.

The dashboard uses the signed-in browser session and never requests a service-role key or GitHub token.

## Reliability guard

A lightweight client guard now:

- detects offline and restored connections;
- stores only short, sanitized runtime error summaries in session storage;
- removes URLs and long token-like strings from stored summaries;
- does not transmit browser errors to a third party.

## Installation

1. Extract `Predict2U_Reliability_Comments_v198_CHANGED_FILES.zip` into the root of the repository.
2. Replace matching files.
3. Commit and push.
4. In Supabase SQL Editor, run `SUPABASE_RELIABILITY_COMMENTS_v198.sql`.
5. Hard-refresh `news.html`, sign in and post a test comment from a story discussion.
6. Open `admin.html#health` and run the checks.

No Edge Function, VAPID key, GitHub secret or API key change is required.

## Cache

`predict2u-v198`

## Validation note

The supplied full-build snapshot does not contain generated `data.js` or `community.js`. The changed-files patch does not delete or replace the live repository copies. All v198-specific JavaScript and self-tests passed; repository preflight and performance budget passed.
