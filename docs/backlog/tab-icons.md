---
type: backlog
project: spendometer
order: 120
kind: design
size: S
status: todo
source: user feedback 2026-11-25
---

# Better tab icons

## Why
"not sure on the icons but good enough for now." In the dark narrow screenshot, `◷` shows as something like `[G]`.

## What
Mockups of other single glyphs for Overview, Context and Cost, and whether the selected tab can be marked without brackets.

## Decision
Emoji tabs: 📊 Overview, 🧠 Context, 💰 Cost (set K). Mockups: `assets/mockups-icons/` (`tab-icons.svg` text glyphs A to G, `tab-icons-svg.svg` drawn icons H to J and emoji K, L, `emoji-tabs.svg` marker variants; each written by its `.sh`).

- **Desktop app:** the selected tab gets an accent pill behind its emoji (K1). Wide row keeps the word beside the emoji; narrow row is the emoji alone.
- **Terminal:** the selected tab stays in brackets (K2), since a terminal Button takes a plain label and cannot draw a pill.

Why:
- Emoji are common, say what the tab holds at a glance, and avoid the `◷` font fallback (`[G]`).
- A pill marks the selected tab without adding width, and works in light and dark.
- The terminal cannot draw it, so brackets stay there.

Open for the build (after item 100):
- Emoji are two cells wide in a terminal; `buttonCols` and the layout widths must count that.
- Emoji look depends on the font; check in the terminal as well as the app.

Rejected: text glyph sets A to G (less clear), drawn SVG icons H to J (more work, same app-only limit), underline and dimming (app only, weaker than the pill).
