// The band's row measured in columns before it is drawn: how wide each layout's row would be, from the text it will
// say. `layoutOf` (layout.ts) picks the first layout that fits. Pure: plain data in, columns out.

import type { Window } from '../../types'
import { paceWords } from '../capacity/usage/art'
import type { PaceMode } from '../capacity/usage/art'
import type { paceFor } from '../capacity/usage/windows'
import { TTL_MIN, mineModel } from '../cost/cache/facts'
import type { CacheView } from '../cost/cache/facts'
import { costOf, usd } from '../cost/prices'
import {
  BLOCK_MARGIN, BUTTON_GAP, CACHE_MARGIN, CHIP_COLS, COMPACT_BUTTON_COLS, COMPACT_CHAR_COLS, COMPACT_MARGIN, COMPACT_STEPS,
  DESKTOP_CHAR_COLS, FOLD_COLS, KEEP_COMPACT_COLS, LABEL_COLS, PACE_TRACK_COLS, PIE_COLS, ROBO_CHIP_COLS, ROBO_COLS, ROW_PAD,
  TEXT_CHIP_COLS, WAITING_COLS, WAITING_ROW_COLS, WAITING_SPEND_GAP, WIDE_LABEL_MARGIN, blockCols, buttonCols, textCols,
} from '../layout'
import type { Need } from '../layout'

export const CELLS = 10
export const LOW_AT = 15
export const TIGHT_CELLS = 6

export const NAMES: Record<string, string> = { seven_day: '7D', five_hour: '5H', spend_limit: 'SPEND' }
/** The compact row's word for a window, after its percent: colour alone told them apart before. */
export const SHORT: Record<string, string> = { seven_day: 'week', five_hour: '5h', spend_limit: 'spend' }

/** What the estimates read; the figures per window are in the order of `list`. */
export type WidthIn = {
  /** The desktop draws (pies, tracks, chip drawings); the terminal writes text. */
  svg: boolean
  list: Window[]
  lefts: number[]
  useds: number[]
  resets: string[]
  paces: ReturnType<typeof paceFor>[]
  total: number
  lastText: string | null
  view: CacheView | null
  /** The keep-warm switch; null beside cache-tax. */
  keep: boolean | null
  /** The fold button is drawn. */
  hasFold: boolean
  /** The tab buttons are drawn, and the words each one has on the wide row (one per tab). */
  tabsShown: boolean
  tabLabels: string[]
}

/** Columns a character of text takes: one in the terminal, about half on the desktop. */
const charsOf = (c: WidthIn) => {
  const k = c.svg ? DESKTOP_CHAR_COLS : 1
  return { k, t: (s: string) => textCols(s, k) }
}

const waitingOnlyOf = (c: WidthIn): boolean => c.list.length === 0 && !c.view

/** The window the compact row keeps when it shows only one: the 5h one, else the first. */
export const fiveAtOf = (list: Window[]): number => Math.max(0, list.findIndex(w => w.kind === 'five_hour'))

const lowText = (c: WidthIn, i: number) => (c.lefts[i] < LOW_AT ? ' LOW' : '')
const nameOf = (w: Window) => NAMES[w.kind] ?? w.kind.toUpperCase()
// The 5h pace beside its percent: a mini track on the desktop, then words (see paceWords).
const paceLine = (c: WidthIn, i: number, mode: PaceMode, full = true) => {
  const p = c.paces[i]
  return p ? paceWords(p, mode, full).line : ''
}
// The track's columns, when the desktop draws one for window i.
const trackCols = (c: WidthIn, i: number, mode: PaceMode) => (c.svg && c.paces[i] ? PACE_TRACK_COLS[mode] : 0)
// The wide row drops the reset time beside the track: the hover tip has it.
const resetText = (c: WidthIn, i: number) => (c.resets[i] && !(c.svg && c.paces[i]) ? ` · ${c.resets[i]}` : '')

const windowCols = (c: WidthIn, isWideRow: boolean, cells: number) => {
  const { k, t } = charsOf(c)
  const { list, useds, lefts, resets, svg } = c
  return list.length === 0
    ? Math.ceil(WAITING_COLS * k) + BLOCK_MARGIN
    : list.reduce(
        (n, w, i) =>
          n +
          (svg
            ? // The pie replaces the dots, and the words say what is used.
              isWideRow
              ? t(`${nameOf(w)}  ${useds[i]}% used${lowText(c, i)}${resetText(c, i)}${paceLine(c, i, 'wide')}`) + PIE_COLS + trackCols(c, i, 'wide') + BLOCK_MARGIN
              : Math.max(t(`${nameOf(w)} `) + PIE_COLS + trackCols(c, i, 'tight') + t(paceLine(c, i, 'tight')), blockCols([`${useds[i]}% used${lowText(c, i)}`, resets[i] ? `resets ${resets[i]}` : ''], 0, k)) + BLOCK_MARGIN
            : isWideRow
              ? t(`${nameOf(w)} ${'●'.repeat(cells)} ${lefts[i]}% left${lowText(c, i)}${resets[i] ? ` · ${resets[i]}` : ''}${paceLine(c, i, 'wide')}`) + BLOCK_MARGIN
              : blockCols([`${nameOf(w)} ${'●'.repeat(cells)}${paceLine(c, i, 'tight')}`, `${lefts[i]}% left${lowText(c, i)}`, resets[i] ? `resets ${resets[i]}` : ''], BLOCK_MARGIN, k)),
        0,
      )
}

const spendCols = (c: WidthIn, isWideRow: boolean) => {
  const { k, t } = charsOf(c)
  const { total, lastText } = c
  return total <= 0
    ? 0
    : isWideRow
      ? t(`COST ≈${usd(total)}${lastText ? ` · last ${lastText}` : ''}`) + BLOCK_MARGIN
      : blockCols(['COST', `≈${usd(total)}`, lastText ? `last ${lastText}` : ''], BLOCK_MARGIN, k)
}

const rowCols = (c: WidthIn, isWideRow: boolean, cells: number, cacheCols: number) => {
  const { k } = charsOf(c)
  return (
    ROW_PAD +
    (waitingOnlyOf(c) ? Math.ceil(WAITING_ROW_COLS * k) + (c.total > 0 ? WAITING_SPEND_GAP : 0) : LABEL_COLS + (isWideRow ? WIDE_LABEL_MARGIN : BLOCK_MARGIN) + windowCols(c, isWideRow, cells)) +
    spendCols(c, isWideRow) +
    cacheCols
  )
}

/**
 * Every layout's width in columns, from the text the row will say. The compact row, from everything (step 0) to the
 * least (step 4): percent left of each window, the cost, the chip and the next message's cost. Steps: 1 next cost
 * only while cold, 2 no total, 3 Robo (the terminal: a letter) for the chip, 4 `26%` for `26% left`.
 */
export const needOf = (c: WidthIn): Need => {
  const { svg, list, view, keep, total, useds, tabsShown } = c
  const { k, t } = charsOf(c)
  const waitingOnly = waitingOnlyOf(c)
  const badgeCols = svg ? ROBO_CHIP_COLS : TEXT_CHIP_COLS
  const minsLeft = view ? Math.max(0, TTL_MIN - view.idleMin) : 0
  const priced = view ? mineModel(view) : undefined
  const nextCost = view && priced ? usd(costOf(priced, view.mode, view.tokens)) : null
  const summaryText = !view ? '' : view.mode === 'cold' ? ` ${view.idle}${nextCost ? ` · ${nextCost}` : ''}` : ` ${minsLeft}m left`
  // The cache state shows in the row whether the card is open or not.
  const hasCache = view !== null
  // The keep button sits right after the chip, so its columns belong to the cache part, not to the buttons.
  // ✓ and ✗ are one character, but a font may draw them two columns wide: measured as two, as the flame was.
  // The mark is one ✓ and its gap; it takes the columns only while it shows (keep-warm on).
  const keepMarkCols = keep === true ? KEEP_COMPACT_COLS : 0
  const keepWideCols = keepMarkCols
  const keepCompactCols = keepMarkCols
  const cacheInlineCols = hasCache ? badgeCols + t(summaryText) + keepWideCols + CACHE_MARGIN : 0
  // Before the first reply there is no chip to sit beside: the keep button stays among the buttons.
  const keepAlone = !view && keep === true
  const buttonsWideCols =
    (c.hasFold ? FOLD_COLS : 0) +
    (tabsShown ? c.tabLabels.reduce((n, label) => n + buttonCols(label, BUTTON_GAP, k), 0) : 0) +
    (keepAlone ? keepMarkCols : 0)
  // Icon buttons on the compact and tight layouts: measured, 6 columns each with its gap.
  // The tabs: a glyph button each, and the one in use has its two brackets.
  const buttonsCols = ((c.hasFold ? 1 : 0) + (tabsShown ? c.tabLabels.length : 0)) * COMPACT_BUTTON_COLS + (keepAlone ? keepMarkCols : 0)
  const k2 = svg ? COMPACT_CHAR_COLS : 1
  const t2 = (s: string) => textCols(s, k2)
  const nextShown = (step: number) => nextCost !== null && (step === 0 || view?.mode === 'cold')
  // The slimmer desktop variants of step 4 (layoutOf): 1 no 5h pace track or words, 2 also no keep box, 3 also
  // only the 5h window (else the first one).
  const fiveAt = fiveAtOf(list)
  const compactAt = (step: number, slim = 0) =>
    ROW_PAD +
    list.reduce(
      (n, w, i) =>
        slim >= 3 && i !== fiveAt
          ? n
          : n +
            (svg
              ? t2(`${step < 4 && SHORT[w.kind] ? `${SHORT[w.kind]} ` : ''}${useds[i]}%${lowText(c, i)}${slim ? '' : paceLine(c, i, 'compact', step < 2)}`) + PIE_COLS + (slim ? 0 : trackCols(c, i, 'compact'))
              : t2(`${step < 4 && SHORT[w.kind] ? `${SHORT[w.kind]} ` : ''}${useds[i]}%${lowText(c, i)}${paceLine(c, i, 'compact', step < 2)}`)) +
            COMPACT_MARGIN,
      0,
    ) +
    (total > 0 && step < 2 ? t2(`≈${usd(total)}`) + COMPACT_MARGIN : 0) +
    (hasCache ? (step < 3 ? (svg ? CHIP_COLS : TEXT_CHIP_COLS) : ROBO_COLS) + (nextShown(step) ? t2(` ${nextCost} next`) : 0) + (slim >= 2 ? 0 : keepCompactCols) + COMPACT_MARGIN : 0)
  // The minimal row: the 5h pie and its percent, Robo and the fold button. No next cost, keep box, tabs or cost.
  const minimalCols = ROW_PAD + PIE_COLS + t2(`${useds[fiveAt] ?? 0}%${list[fiveAt] ? lowText(c, fiveAt) : ''}`) + COMPACT_MARGIN + ROBO_COLS + COMPACT_MARGIN + COMPACT_BUTTON_COLS
  // From the first reply on the desktop the band is one row at every width (tabs shown); the terminal keeps its layouts.
  const slimNeed = svg && tabsShown && !waitingOnly ? { slim: [1, 2, 3].map(s => compactAt(4, s)), minimal: minimalCols } : {}
  return {
    wide: rowCols(c, true, CELLS, cacheInlineCols),
    compact: Array.from({ length: COMPACT_STEPS }, (_, s) => (waitingOnly ? rowCols(c, false, CELLS, 0) : compactAt(s))),
    tight: view ? ROW_PAD + badgeCols + t(summaryText) + keepCompactCols : rowCols(c, false, TIGHT_CELLS, 0),
    buttons: buttonsCols,
    buttonsWide: buttonsWideCols,
    fold: c.hasFold && tabsShown ? COMPACT_BUTTON_COLS : 0,
    ...slimNeed,
  }
}
