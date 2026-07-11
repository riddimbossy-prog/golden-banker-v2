# Predict2U v181 — Real Backend Admin

## What changed

Predict2U no longer relies on the old browser-only PIN console for live operations. The active admin page now uses:

- Supabase Authentication
- Server-side admin roles
- Row Level Security
- Protected RPC functions
- Permanent audit logs
- Server-backed site settings
- Server-backed Community moderation
- Account deletion request management

No service-role key, GitHub token, API secret, bookmaker password or payment information is stored in browser code.

## Admin roles

### Owner

- Everything an admin can do
- Assign or suspend owner/admin/moderator roles
- View the role directory
- Cannot demote or deactivate their own owner account through the browser console
- The backend prevents removal of the last active owner

### Admin

- Publish or unpublish the daily board
- Manage compact announcements
- Feature leagues and engines
- Verify, hide, review or clear Community records
- Process account deletion request statuses
- View the audit log

### Moderator

- Verify, hide, review or clear Community records
- View the audit log
- Cannot change publishing settings, process account deletion requests or assign roles

## One-time Supabase setup

1. Confirm your Predict2U account already exists in Supabase Authentication.
2. Open `SUPABASE_BACKEND_ADMIN_v181.sql`.
3. Replace:

```sql
YOUR_ACCOUNT_EMAIL@example.com
```

with the exact email address of your working Predict2U account.

4. Open Supabase → SQL Editor.
5. Paste the complete SQL file.
6. Click **Run**.

The script stops with a clear error if the placeholder is not replaced or the email is not found in Supabase Auth.

## New backend tables

```text
p2u_admin_roles
p2u_site_settings
p2u_community_moderation
p2u_admin_audit_log
```

The existing v180 account tables remain unchanged.

## Protected backend functions

```text
p2u_admin_save_site_settings
p2u_admin_moderate_community
p2u_admin_set_deletion_status
p2u_admin_assign_role
```

Every function checks the signed-in account role on the server before changing data.

## Open the console

```text
https://predict2u.com/admin.html
```

Sign in through the existing Account Center first. No extra password or local PIN is required.

## How public updates work

Public pages load the committed `admin-config.js` as a safe fallback, then request the current server settings from Supabase.

- New announcements and board state are picked up automatically.
- Community moderation is applied from the backend.
- Public pages refresh the server configuration every 60 seconds while visible.
- `window.P2USiteControls.refresh()` can trigger an immediate refresh.
- If Supabase is unavailable, the website continues using the safe committed fallback.

## Community moderation states

- `review`: internal moderation queue only
- `verified`: public verified badge
- `hidden`: record removed from public Community views
- `clear`: removes the moderation record

Moderation reasons remain available to admins and are not shown publicly.

## Account deletion requests

The admin console changes request workflow status only:

```text
pending
processing
completed
cancelled
```

Deleting a Supabase Auth user and removing public records should still be performed carefully in Supabase after verification.

## Install

Copy all files from the changed-files package into the repository and replace existing files.

Commit message:

```text
Install Predict2U v181 Real Backend Admin
```

Push to GitHub, allow Site Quality to run, then run the SQL setup once.

## Service worker

```js
const CACHE_VERSION = "predict2u-v181";
```

Hard-refresh the live site once after deployment.

## Validation completed

- Repository preflight passed
- 57 required public files found
- Performance budget passed with 0 errors and 0 warnings
- Repository audit passed with 0 critical issues and 0 warnings
- 160 audit checks passed
- JavaScript syntax passed for all modified runtime and test files
- Engine registry remains 16/16

The full Playwright browser suite is configured for GitHub Actions. It was not executed in this sandbox because the local package does not contain the installed `@playwright/test` dependency.
