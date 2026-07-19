# Enhancements and expected behavior — v267

## Why this was changed
The previous controls were technically functional but visually read as several unrelated rows. The hidden Best/Worst polarity group was also forced visible by an older CSS rule.

## New behavior
- Best and Worst appear once for normal team rankings.
- The additional Best/Worst Order control appears only for Attack or Defence.
- View and Category behave as segmented controls.
- League and Search stay together in one filter row on desktop.
- On phones and Z Fold cover screens, fields stack cleanly while category buttons remain horizontally usable.
- Today, Bankers, Full Board, Engines and News use the same control height, border, active state and spacing.
- No engine thresholds, team calculations, picks, odds rules or Matchup Lab logic were changed.
