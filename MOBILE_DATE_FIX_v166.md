# Predict2U v166 — Mobile Date Rail Fix

## Problem fixed
The match-date controls used the same wide pill style as engine filters. On phones this placed the date and fixture count on one line, creating oversized controls and an awkward horizontal layout—especially when a date contained hundreds or thousands of fixtures.

## Changes
- Replaced date pills with dedicated compact date cards.
- Fixed English date formatting across phone locales.
- Shows weekday/TODAY, calendar date, and fixture count on separate lines.
- Abbreviates large counts such as 1.2K.
- Keeps labels on one line and prevents wrapping or clipping.
- Uses horizontal touch scrolling with snap alignment.
- Automatically centers the selected date.
- Adds disabled styling for dates with no fixtures.
- Includes accessible labels and selected-state metadata.
- Adds tighter sizing for 280–359px screens and Galaxy Z Fold cover displays.

## Files changed
- index.html
- board.html
- tests/mobile-layout.spec.js
- package.json
- sw.js
- BUILD_VERSION.txt
