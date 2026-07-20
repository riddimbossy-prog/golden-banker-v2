# Predict2U v270 — Auto Picks Learning Supervisor

## Install
1. Copy the patch into the repository root and replace the listed files.
2. In Supabase, open SQL Editor and run `supabase/auto-picks-learning-v270.sql` once.
3. Confirm GitHub Secrets contain `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
4. Add the private `AUTO_LEARNING_POLICY_B64` secret from the separate private setup file supplied with this build.
5. Commit and push.
6. Run **Predict2U Auto Picks Learning** manually once.
7. Reopen the PWA so cache v270 activates.

The public page shows only a compact model status and settled outcomes. Detailed learning records remain behind Supabase RLS and in a private GitHub Actions artifact.
