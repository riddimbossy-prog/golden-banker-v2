# Specialist Family Architecture v1.0

## 1. Purpose

The specialist family sits beside the main PurePPG ladder:

`Normal → Strict → Ultra → Elite → Apex → Prime → Expert → Pro`

The version ladder controls general strictness. The specialist family studies one particular kind of signal deeply.

## 2. Universal scoring bands

| Score | Classification |
|---:|---|
| 88–92 | Prime specialist signal |
| 84–87 | Elite specialist signal |
| 81–83 | Strong specialist signal |
| 78–80 | Qualified specialist signal |
| 74–77 | Watchlist only |
| Below 74 | No Bet |

Maximum displayed specialist score is 92.

## 3. Universal data-quality bands

| Data quality | Meaning |
|---:|---|
| 88–100 | Excellent |
| 80–87 | Strong |
| 72–79 | Usable |
| 65–71 | Weak |
| Below 65 | Blocked |

An official specialist selection normally requires data quality of at least 72. Straight wins, half markets and value selections may impose higher limits.

## 4. Veto levels

### NONE
The engine found no material contradiction.

### SOFT
The aggressive market is blocked, but a safer related market may remain eligible.

Example:

```text
Soft veto: Home Win
Compatible safer markets: Home DNB, 1X
```

### HARD
The exact market family or fixture must not be used by the Pro consensus layer.

Examples:

- contaminated or mixed data;
- major market contradiction;
- insufficient direct half data for a half market;
- uncalibrated probability for a Value selection;
- opposing high-strength specialist signals.

## 5. Market families

- `HOME_RESULT`: Home Win, Home DNB, 1X
- `AWAY_RESULT`: Away Win, Away DNB, X2
- `HOME_SCORING`: Home O0.5, Home O1.5
- `AWAY_SCORING`: Away O0.5, Away O1.5
- `HOME_SUPPRESSION`: Home U1.5
- `AWAY_SUPPRESSION`: Away U1.5
- `MATCH_OVER`: Over 1.5, Over 2.5
- `MATCH_UNDER`: Under 2.5, Under 3.5
- `BTTS_YES`
- `BTTS_NO`
- `FIRST_HALF`
- `SECOND_HALF`
- `DRAW_STRUCTURE`

## 6. Safer-market ladders

Home direction:

```text
Home Win → Home DNB → 1X → Home O0.5 → No Bet
```

Away direction:

```text
Away Win → Away DNB → X2 → Away O0.5 → No Bet
```

Goal aggression:

```text
Over 2.5 → Over 1.5 → No Bet
```

Goal suppression:

```text
Under 2.5 → Under 3.5 → No Bet
```

A specialist may downgrade only when the safer market passes its own minimum evidence rules.

## 7. Universal hard No-Bet conditions

- Future or post-match data contamination
- Mixed home/away splits presented as venue data
- Duplicate fixtures affecting percentages
- Impossible rates or sample counts
- Friendly match unless the engine explicitly supports friendlies
- No supported market reaches its threshold
- Two incompatible candidate markets finish within two points and conflict cannot be resolved
- Evidence depends entirely on one team when the market requires two-sided confirmation
