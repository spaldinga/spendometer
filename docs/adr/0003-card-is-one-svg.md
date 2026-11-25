# 0003. The card is one hand-drawn SVG; the terminal gets no card

Status: accepted (2026-11-25, recorded after the fact)

## Context
The open card shows bars, dots, pies and figures side by side. The host's `Text` and `Box` cannot draw bars with a time
tick or split bars. A `Svg` element can, but it is drawn as an image: it cannot reach the app's fonts, cannot be
measured, and cannot take a press. The terminal has no `Svg`.

## Decision
Draw the card as one SVG string in pure functions (`hooks/cache-art.ts`), with the Outfit font embedded
(`hooks/font.ts`). Text widths are estimated from character counts. Everything pressable (fold, tabs, keep warm) is a
`Button` in the band's row, not part of the drawing. Hover text inside the drawing uses `isInteractive`; the band's
own hovers are boxes shown on hover. In the terminal the card is not shown: the row alone says the cache state.

## Consequences
- The drawing is testable as a string, with no engine.
- Text that does not fit is avoided by picking the longest variant whose estimate fits, not by measuring.
- The card's height must be known before drawing, so the band can stay within `maxRows` (`fitOpen`).
- Terminal users see no card, tabs or pictures.
