// Which layout the band takes, chosen from what its row holds. Pure: the band
// estimates each layout's width in columns and asks here. Nothing touches the engine.

import type { Kind } from './cache-art'

/** A row's side padding (paddingX={1}), both sides. */
export const ROW_PAD = 2
/**
 * How many columns one character of text takes. In the terminal a character is a column. On the
 * desktop a column is 12 px, but the app's text runs about 6 px a character: measured from
 * screenshots on 2026-11-12, a usage window of 30 characters drew 174 px and a 24-character cost
 * line 151 px. Margins and padding are in columns on both surfaces and are not scaled.
 */
export const DESKTOP_CHAR_COLS = 0.5
/** A text's width in columns at `k` columns a character. */
export const textCols = (s: string, k = 1): number => Math.ceil(s.length * k)
/** A Button draws its label plus this many columns of frame (measured about 2.5 on the desktop). */
export const BUTTON_CHROME = 3
/** The Button groups on the band sit one column apart. */
export const BUTTON_GAP = 1
/** The fold button's `+` or `−`: its frame and the one character. */
export const FOLD_COLS = 1 + BUTTON_CHROME
/** Robo, a space and the chip, as drawings: about 26 + 8 + 63 px. */
export const ROBO_CHIP_COLS = 8
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
 * One icon button on the compact and tight layouts, its gap included: about 58 px plus a 12 px gap
 * measured on 2026-11-13, 70 px = 6 columns. The fold button counts the same.
 */
export const COMPACT_BUTTON_COLS = 6
/** Columns of slack a compact variant with the buttons inline must leave. */
export const COMPACT_SLACK = 2
/** The compact row's variants, from everything (0) to the least (4); see layoutOf. */
export const COMPACT_STEPS = 5
/** A compact row's right margin between its groups. */
export const COMPACT_MARGIN = 2
/** The USAGE label, without its right margin. */
export const LABEL_COLS = 5
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
}

export type Layout = { kind: Kind; buttonsRow: boolean; compactStep: number }

/**
 * wide with the word buttons inline, else the first compact variant that fits with the icon buttons
 * inline (and COMPACT_SLACK to spare), else the last variant with the buttons on a row of their own,
 * else tight, the icon buttons on the cache row if they fit.
 */
export const layoutOf = (columns: number, need: Need): Layout => {
  const room = columns
  const b = need.buttons
  if (need.wide + need.buttonsWide <= room) return { kind: 'wide', buttonsRow: false, compactStep: 0 }
  for (let s = 0; s < need.compact.length; s++) {
    if (need.compact[s] + b + COMPACT_SLACK <= room) return { kind: 'stacked', buttonsRow: false, compactStep: s }
  }
  const last = need.compact.length - 1
  if (need.compact[last] <= room) return { kind: 'stacked', buttonsRow: b > 0, compactStep: last }
  return { kind: 'tight', buttonsRow: b > 0 && need.tight + b > room, compactStep: 0 }
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
/** A drawing's height in rows. */
export const rowsOf = (px: number): number => Math.ceil(px / ROW_PX)

/**
 * What the open band keeps so it stays within `maxRows` and never scrolls. It gives up the card's limits
 * zone first (the row says the same, shorter), then the progress row. The card itself always stays: the
 * person opened it.
 */
export const fitOpen = (maxRows: number, rowsAbove: number, progressPx: number, cardPx: number, bareCardPx: number): { limits: boolean; progress: boolean } => {
  const prog = progressPx > 0 ? rowsOf(progressPx) : 0
  if (rowsAbove + prog + rowsOf(cardPx) <= maxRows) return { limits: true, progress: true }
  if (rowsAbove + prog + rowsOf(bareCardPx) <= maxRows) return { limits: false, progress: true }
  return { limits: false, progress: false }
}
