# Predict2U v182 — Backend Admin UI Upgrade

## Purpose
A mobile-first visual upgrade for the secure v181 Supabase admin console. No database schema, RLS policy, RPC or API configuration changes are required.

## Improvements
- Rebuilt the mobile header and eliminated the duplicate/floating account avatar overlap.
- Added a real account chip that reuses the v180 cloud account session.
- Converted the admin navigation into a sticky, swipeable mobile tab rail.
- Reworked the overview into a compact 2 × 2 metric grid on phones and Z Fold cover screens.
- Reduced card height and excess vertical space.
- Added metric icons, live system state and clearer dashboard hierarchy.
- Added compact two-column quick actions.
- Improved publishing, moderation, roles, accounts and audit layouts.
- Added safe-area spacing, 280–360 px phone protection and reduced-motion handling.
- Preserved all v181 backend permissions and server-side actions.

## Changed files
- admin.html
- backend-admin.css
- backend-admin.js
- tests/admin-control.spec.js
- package.json
- sw.js
- BUILD_VERSION.txt
- audit-site.js

## Deployment
Copy the changed files into the current repository, replace existing files, commit and push. Hard-refresh admin.html once after deployment.
