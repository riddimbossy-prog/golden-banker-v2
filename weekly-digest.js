name: Weekly digest email
# Sunday summary of each user's week — wins AND losses. Opt-in (email_digest).
on:
  schedule:
    - cron: "0 18 * * 0"      # Sundays 18:00 UTC
  workflow_dispatch: {}
permissions:
  contents: read
jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - name: Send weekly digests
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
        run: node weekly-digest.js
