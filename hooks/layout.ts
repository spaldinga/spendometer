// Which layout the band takes, chosen from what its row holds. Pure: the band
// estimates each layout's width in columns and asks here. Nothing touches the engine.

import type { Kind } from './cache-art'

/** A row's side padding (paddingX={1}), both sides. */
export const ROW_PAD = 2
/**
 * How many columns one character of text takes. In the terminal a character is a column. On the
 * desktop a column is about 8.6 px (DESKTOP_COL_PX), not the 12 px first assumed. Measured on
 * 2026-11-18 at 104 columns: `7D ●…● 80% left · 4d 1h` (30 characters) 23.6 columns, the 5H window
 * (34) 26.9, `COST ≈$12.57 · last $0.46` (25) 17.3: about 0.78. Margins and padding are in columns on
 * both surfaces and are not scaled.
 */
export const DESKTOP_CHAR_COLS = 0.78
/** A text's width in columns at `k` columns a character. */
export const textCols = (s: string, k = 1): number => Math.ceil(s.length * k)
/**
 * A Button draws its label plus this many columns of frame. Measured on 2026-11-18: `🔥 Keep warm`
 * 13.75 columns, the fold button 4.
 */
export const BUTTON_CHROME = 4
/** The Button groups on the band sit one column apart. */
export const BUTTON_GAP = 1
/** The fold button's `+` or `−`: its frame and the one character. */
export const FOLD_COLS = 1 + BUTTON_CHROME + BUTTON_GAP
/** Robo, a space and the chip, as drawings: measured 10 columns on 2026-11-18. */
export const ROBO_CHIP_COLS = 10
/** The terminal's chip: ` WARM ` as text. */
export const TEXT_CHIP_COLS = 6
/**
 * The compact row's text, in columns a character on the desktop. Measured from a screenshot on
 * 2026-11-13 (12 px a column at a scale of about 1.05): `26% left` 85 px = 6.7 columns for 8
 * characters, `≈$0.91` 75 px = 6 for 6, `$0.02 next` 105 px = 8.3 for 10: about 0.85. The wide row's
 * text stays at DESKTOP_CHAR_COLS, which its own screenshots confirmed. The terminal is 1.
 */
export const COMPACT_CHAR_COLS = 0.85
/** The compact row's chip as a drawing: about 95 px measured, 8 columns. Its text form, ` WARM `, is TEXT_CHIP_COLS. */
export const CHIP_COLS = 8
/** Robo alone, 26 px: about 3 columns. The terminal's one-letter chip ` W ` is 3 too. */
export const ROBO_COLS = 3
/**
 * One icon button on the compact and tight layouts, its gap included. Measured again on 2026-11-26 at 58
 * columns (590 px, about 10.2 px a column): `◷`, `$` and `+` each 30 px plus a 10 px gap, 40 px = 4 columns;
 * (the tabs are emoji now; their width is not yet measured). The 2026-11-13 figure (58 px plus
 * 12, 6 columns) sent the buttons to a row of their own with half the row empty. The fold button counts the same.
 */
export const COMPACT_BUTTON_COLS = 4
/**
 * The keep-warm box on the compact and tight rows: a plain ✓ with its gap, measured 2026-11-26 at 51 columns
 * (520 px, about 10.2 px a column) at about 31 px: 3 columns. It has no button background, so it is smaller than the icon buttons.
 */
export const KEEP_COMPACT_COLS = 3
/** Columns of slack a compact variant with the buttons inline must leave. */
export const COMPACT_SLACK = 2
/** The compact row's variants, from everything (0) to the least (4); see layoutOf. */
export const COMPACT_STEPS = 5
/** A compact row's right margin between its groups. */
export const COMPACT_MARGIN = 2
/** The USAGE label, without its right margin. */
export const LABEL_COLS = 6
/** A block's right margin: usage windows, cost. */
export const BLOCK_MARGIN = 3
/** The wide row's label and the cache block's right margin. */
export const WIDE_LABEL_MARGIN = 2
export const CACHE_MARGIN = 2
/** The words "waiting for the first reply" and, with the label, "USAGE · waiting for the first reply". */
export const WAITING_COLS = 'waiting for the first reply'.length
export const WAITING_ROW_COLS = 'USAGE · waiting for the first reply'.length
/** The cost box's margin to the words, in the row of the early return. */
export const WAITING_SPEND_GAP = 2

/** A text block's width: its longest line plus its right margin, at `k` columns a character. */
export const blockCols = (lines: string[], margin: number, k = 1): number => Math.max(0, ...lines.map(l => textCols(l, k))) + margin
/** A Button's width: its label, the frame and its marginLeft, at `k` columns a character. */
export const buttonCols = (label: string, marginLeft = BUTTON_GAP, k = 1): number => textCols(label, k) + BUTTON_CHROME + marginLeft

/** Estimated widths in columns, each without the buttons. */
export type Need = {
  /** The one wide row: label, both windows, cost, the cache inline when folded. */
  wide: number
  /**
   * The compact row's variants 0 to 4, each narrower than the one before: 0 everything, 1 the next
   * cost only while cold, 2 no cost total, 3 Robo alone for the chip, 4 `26%` for `26% left`.
   */
  compact: number[]
  /** The tight layout's cache row (or, with no cache yet, its usage row). */
  tight: number
  /** The fold button and the icon-only buttons together. */
  buttons: number
  /** The fold button and the buttons with their words, as the wide row draws them. */
  buttonsWide: number
  /** The fold button's columns inside `buttons` when the narrow layouts may drop it (the tabs are there to open and close the card), else 0. */
  fold: number
  /** The desktop's slimmer variants of the last compact step, each narrower than the one before (no buttons counted): 1 no pace track, 2 also no keep box, 3 also only the 5h window. */
  slim?: number[]
  /** The minimal row: the 5h pie and percent, Robo and the fold button. Set with `slim`. */
  minimal?: number
}

export type Layout = {
  kind: Kind
  buttonsRow: boolean
  compactStep: number
  fold: boolean
  /** The slimmer variants of the last compact step, desktop only: 1 no pace track, 2 also no keep box, 3 also only the 5h window. Absent: none. */
  slim?: number
}

/**
 * wide with the word buttons inline, else the first compact variant that fits with the icon buttons
 * inline (and COMPACT_SLACK to spare), else (when the fold button can be dropped, as the tabs open and close
 * the card) the last variant with the buttons inline but no fold button. On the desktop (`need.slim` and
 * `need.minimal` set) the row then slims down, one step at a time, and always ends in the minimal row, which is
 * chosen even when it does not fit: the band is one row at every width. Without them (the terminal, and the
 * desktop before the first reply): the last variant with the buttons off the row (a row of their own), else
 * tight, the icon buttons on the cache row if they fit. `need.fold` is 0 when the fold button cannot go.
 */
export const layoutOf = (columns: number, need: Need): Layout => {
  const room = columns
  const b = need.buttons
  if (need.wide + need.buttonsWide <= room) return { kind: 'wide', buttonsRow: false, compactStep: 0, fold: true }
  for (let s = 0; s < need.compact.length; s++) {
    if (need.compact[s] + b + COMPACT_SLACK <= room) return { kind: 'stacked', buttonsRow: false, compactStep: s, fold: true }
  }
  const last = need.compact.length - 1
  const drops = need.fold > 0
  const bare = b - need.fold
  if (drops && need.compact[last] + bare + COMPACT_SLACK <= room) return { kind: 'stacked', buttonsRow: false, compactStep: last, fold: false }
  if (need.slim && need.minimal !== undefined) {
    for (let i = 0; i < need.slim.length; i++) {
      if (need.slim[i] + bare + COMPACT_SLACK <= room) return { kind: 'stacked', buttonsRow: false, compactStep: last, fold: false, slim: i + 1 }
    }
    return { kind: 'minimal', buttonsRow: false, compactStep: last, fold: true, slim: need.slim.length }
  }
  if (need.compact[last] <= room) return { kind: 'stacked', buttonsRow: (drops ? bare : b) > 0, compactStep: last, fold: !drops }
  return { kind: 'tight', buttonsRow: (drops ? bare : b) > 0 && need.tight + (drops ? bare : b) > room, compactStep: 0, fold: !drops }
}

/**
 * A column's real width on the desktop, in px. Measured on 2026-11-16: the band at 69 columns drew about
 * 600 px wide. Rounded down, so a drawing sized from it never runs past the band.
 */
export const DESKTOP_COL_PX = 8.6

/**
 * How many pixels one of the band's rows is on the desktop, for counting a drawing's height in rows.
 * A guess, not measured: a column is about 8.7 px and a line of text about twice that. Kept on the low
 * side, so a drawing counts as more rows and the band gives up a part before it would scroll.
 */
export const ROW_PX = 18
/**
 * What one of the card's columns needs, in drawn px: its longest caption at 18 px, the same width the card
 * has always taken for each of its four columns.
 */
export const CARD_COL_PX = 315

/**
 * How many columns the card takes at a drawn width of `drawnPx`: as many as fit at CARD_COL_PX each plus
 * the 26 px gap and 13 px margin on both sides (the margins and one gap fewer than columns cancel out:
 * (W - 26 + 26) / (CARD_COL_PX + 26)), at least one and at most four. The card draws at most three
 * (DELEGATION, IN CACHE, SPEND), wider at four; the zones left without a column become status lines.
 */
export const cardColsOf = (drawnPx: number): number => Math.min(4, Math.max(1, Math.floor((drawnPx - 26 + 26) / (CARD_COL_PX + 26))))

/** A drawing's height in rows. */
export const rowsOf = (px: number): number => Math.ceil(px / ROW_PX)

/**
 * How many rows a hover tip sits above the bottom of what it explains, so its frame clears the row's text.
 * The engine takes whole cells only (no "100%"). The tallest things with a tip are Robo (26 px) and the
 * chip (21 px): 2 rows at ROW_PX. At 1 the tip's bottom frame ran through "$0.03 next" (seen 2026-11-25).
 */
export const TIP_LIFT = 2

/**
 * What the open band keeps so it stays within `maxRows` and never scrolls: the progress row stays only
 * if it fits with the card. The card itself always stays: the person opened it.
 */
export const fitOpen = (maxRows: number, rowsAbove: number, progressPx: number, cardPx: number): { progress: boolean } => {
  const prog = progressPx > 0 ? rowsOf(progressPx) : 0
  return { progress: rowsAbove + prog + rowsOf(cardPx) <= maxRows }
}

/** The usage pie, 16 px, as a drawing: about 2 columns at DESKTOP_COL_PX. The spaces around it are counted as text. */
export const PIE_COLS = 2

/**
 * The 5h pace track in the top row (PACE_TRACK_PX in cache-art.ts, 64, 44 and 30 px) as columns at DESKTOP_COL_PX,
 * rounded up, plus the one column of margin before it. The words after it are counted as text.
 *
 * The compact track is 44 px: measured 2026-11-26 at about 10.2 px a column (58 columns = 590 px), 4.3 columns, so 5 with
 * the margin before it (it was 7 at the old 8.6 px a column). The estimate must stay at or above the real width: an
 * under-estimate makes the app wrap.
 */
export const PACE_TRACK_COLS = { wide: 8 + 1, compact: 5, tight: 4 + 1 } as const
