# Predict2U v255 — Automatic Fast All Games + Fixture Snapshot

This patch makes both data workflows automatic and prevents them from hitting API-Football at the same time.

## Automatic schedule (UTC / Ghana time)

- **Predict2U Fast All Games:** 02:30 and 14:30 every day.
- **Predict2U Fast Fixture Snapshot:** 00:20, 06:20, 12:20 and 18:20 every day.
- **After every successful Fast All Games run:** Fixture Snapshot starts automatically again, so `fixtures.js` is refreshed after the full engine build.

## Collision protection

Both workflows now use the same GitHub Actions concurrency group:

```yaml
concurrency:
  group: predict2u-data-write
  cancel-in-progress: false
```

This queues one workflow behind the other instead of allowing simultaneous API requests or competing Git pushes.

## Files to replace

- `.github/workflows/future-fixtures.yml`
- `.github/workflows/fixture-snapshot.yml`

## Installation

1. Copy the two workflow files into the same paths in the repository.
2. Commit and push to `main`.
3. Open **GitHub → Actions**.
4. Open **Predict2U Fast All Games**, select the `...` menu and confirm **Enable workflow** is not shown. If it is shown, click it.
5. Repeat for **Predict2U Fast Fixture Snapshot**.
6. Run each workflow manually once to confirm the secrets and new workflow revision work.

Scheduled GitHub Actions use UTC. Ghana uses UTC, so the listed times are also Ghana local times.
