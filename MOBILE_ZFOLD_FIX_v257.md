# Predict2U v257 — Mobile and Z Fold UI Repair

## Fixed

- Smart Alerts notification drawer no longer appears as unstyled purple links.
- Notification cards, tabs, close button, settings and footer stay readable on very narrow cover screens.
- Mobile navigation remains visible and usable from 240 px cover screens through unfolded foldable widths.
- Z Fold inner screens now use the compact app navigation instead of a squeezed desktop rail.
- Global overflow protection prevents cards, forms, tables and long text from widening the page.
- News hero, filters, search, personalization form, story cards, buttons and discussion drawer adapt to foldable screens.
- On narrow phones, news cards switch to a vertical image/card layout instead of crushing text beside a thumbnail.
- The discussion panel becomes a bottom sheet on phones.
- Short landscape fold posture receives a reduced-height dock.
- Service worker cache upgraded to v257 so old broken CSS is cleared.

## Main repair file

`mobile-zfold-v257.css`

The stylesheet is linked directly by the main pages and is also injected by the unified shell and Smart Alerts scripts as a fallback.
