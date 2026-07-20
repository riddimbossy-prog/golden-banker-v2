# Predict2U v270 — Enhancements and behaviour

## Added
- Frozen pre-kickoff Auto Pick snapshots.
- Automatic grading after score updates.
- Private profile/market/league performance review.
- A hashed guard file that can quietly restrict or confirm combinations without naming the private rule behind the decision.
- Model versioning: Auto Profile v1.1.
- Compact public learning status and recent verified outcomes.

## Why
The system must improve from settled evidence without exposing Predict2U's internal weights, detailed thresholds or profile-pair records on the public site.

## Expected behaviour
- New Auto Picks are captured before kickoff.
- Finished matches settle automatically.
- Small samples do not change production behaviour.
- Proven weak combinations can be restricted.
- Confirmed combinations can receive only a capped private-policy adjustment.
- Public users see status and results, not the private rulebook.
- When Supabase is unavailable, the Auto Picks page still works; only shared learning pauses.
