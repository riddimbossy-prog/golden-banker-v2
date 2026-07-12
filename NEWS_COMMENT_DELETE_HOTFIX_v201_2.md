# Predict2U v201.2 — Comment Owner Delete Hotfix

## What was wrong

The delete RPC soft-deleted comments by setting `body=''`.

Older News installations enforce:

`char_length(body) between 1 and 600`

That caused deletion to fail even when the signed-in user owned the comment.

## What this fixes

- Owners can delete their own comments.
- Deleted comments disappear from the public discussion.
- Likes attached to the comment are removed.
- Like totals are reset.
- Other users still cannot delete someone else's comment.
- Moderation history remains intact.

## Install

1. Open **Supabase → SQL Editor → New query**.
2. Paste the complete contents of:
   `SUPABASE_NEWS_COMMENT_DELETE_HOTFIX_v201_2.sql`
3. Click **Run**.
4. Hard-refresh `news.html`.
5. Sign in, open your comment, and press **Delete**.

No repository files, Edge Functions, GitHub secrets, VAPID keys, or workflows need changing.
