// The band's render (`ui.render`): reads what each domain shows, measures the row in columns, picks a layout and
// builds the row, the buttons, the progress row and, when it is open, the card. The pieces are in row.tsx,
// progress-row.tsx and buttons.tsx; the estimates are in widths.ts. Zero token cost: it reads the engine's own
// figures and draws.

import { read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { BAR_H } from '../activity/progress/art'
import { readProgress, readTurn } from '../activity/progress/state'
import { THEMES } from '../activity/progress/themes'
import { runningCrew } from '../activity/crew'
import { openOutput } from '../activity/output/state'
import { fmtReset } from '../capacity/usage/art'
import { keptWindows, liveWindows, paceFor, trackPace } from '../capacity/usage/windows'
import { readStoredCache, viewOf } from '../cost/cache/facts'
import type { Keep } from '../cost/cache/keepwarm/state'
import { keepOf } from '../cost/cache/keepwarm/lifecycle'
import { readDays, readSpend } from '../cost/spend/record'
import { usd } from '../cost/prices'
import { DESKTOP_COL_PX, bandPx, fitOpen, layoutOf, rowsOf } from '../layout'
import { heldBand } from '../safety/guard/band'
import { heldNow } from '../safety/guard/hold'
import { foldButtonOf, keepMarkOf, readFold, tabButtons, tabLabel, tabOf } from './buttons'
import type { BandUi, TipCtx } from './buttons'
import { TABS, cardSvg } from './card'
import { metricsOf } from './card-metrics'
import { progressRowOf } from './progress-row'
import { cacheRows, spendBoxOf, usageBand, usageLabel, usageOf, waitingBand } from './row'
import type { RowCtx } from './row'
import { themeOf } from './settings'
import { noteFit, noteWidth } from './width-note'
import { needOf } from './widths'

/** How often the band redraws, so the countdown and the warm-to-cold flip stay current. */
const TICK_MS = 30_000

/**
 * The 30 s redraw. A reload loses this flag and the old timer with it, and a resume may skip session.start,
 * so the timer is armed from the start, the first request and the first render; the flag keeps it to one.
 */
let ticking = false
export function arm($: EngineInterface): void {
  if (ticking) return
  ticking = true
  try {
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
  } catch {
    ticking = false
  }
}

/** What the render reads of the event. */
type RenderEvent = {
  props: { hasSurvey?: unknown; bodyColumns?: number; maxRows?: number; isWorking?: unknown }
  surface?: string
  viewport?: { columns?: number }
}

/** The band above the prompt for `e`; `kw` is the keep-warm pinger's state, for the mark. */
export async function renderBand<E extends RenderEvent, R>($: EngineInterface, e: E, next: (e: E) => R, kw: Keep) {
  if (e.props.hasSurvey) return next(e)

  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  // Svg draws on desktop, mobile and VS Code; the terminal gets the text form.
  // Ask the surface, not the table: the terminal's table still lists Svg.
  const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null
  const bandUi: BandUi = { Box, Button, Text, Svg }

  // A held command takes the band: what it would lose, and the two answers. Cancel comes first.
  const holding = heldNow()
  const heldEl = holding ? heldBand(holding, ui) : null
  if (heldEl) return heldEl
  // The atom is cleared by a resume and refilled only by events that may not come: an empty one asks the engine.
  arm($)
  const kept = await keptWindows($)
  const now = await $.clock.now()
  // A window whose reset time has passed is a new window: the stored share used is from the old one.
  // Shown as 100% left with no reset time until the next reply brings the real figures.
  const list = (kept.length > 0 ? kept : await liveWindows($)).map(w =>
    w.resetsAt && Date.parse(w.resetsAt) <= now ? { ...w, percentUsed: 0, resetsAt: undefined } : w,
  )
  const view = viewOf((await read($, { plugin: 'spendometer', key: 'cache' } as const)) ?? (await readStoredCache($)), now)

  // Ticked while the cache is kept warm (see keepOf); null (no button) beside cache-tax.
  const keepView = await keepOf($, kw)
  const keep = keepView === null ? null : keepView.on
  const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 100
  const tipCtx: TipCtx = { ui: bandUi, columns }
  const keepMark = keepMarkOf(tipCtx, keepView)
  const grow = <Box key="grow" flexGrow={1} />

  // What the conversation has cost so far, read from the store: it survives a restart.
  const paid = await readSpend($)
  const total = paid ? paid.main + paid.subs : 0
  const lastText = paid && paid.last > 0 ? usd(paid.last) : null

  // Folding needs the card, and the card is a drawing: the terminal stays hasCache.
  const stored = await readFold($)
  const open = view !== null && Svg !== null && (stored && stored.mode === view.mode ? stored.open : view.mode === 'cold')
  const button = Svg && view ? foldButtonOf($, tipCtx, open) : null

  // The card's tabs, whenever the fold button shows (open or closed).
  const tab = await tabOf($)
  const tabsShown = Svg !== null && view !== null
  const tabEls = (isWide: boolean) => (tabsShown ? tabButtons($, tipCtx, tab, isWide) : [])
  // The layout follows from what the row holds: each width is counted in columns from the
  // text the row will say (band/widths), and layoutOf picks the first layout whose row fits.
  const lefts = list.map(w => Math.max(0, Math.round((100 - w.percentUsed) * 10) / 10))
  // The compact row writes what is used, as /usage does. On the desktop the wide and stacked rows do too, beside a pie;
  // the terminal keeps what is left beside its dots.
  const useds = lefts.map(l => Math.round((100 - l) * 10) / 10)
  const resets = list.map(w => fmtReset(w.resetsAt, now))
  const paces = list.map(w => paceFor(w, now))
  // Before the first reply there is no chip to sit beside: the keep button stays among the buttons.
  const keepAlone = !view && keep === true
  const need = needOf({
    svg: Svg !== null, list, lefts, useds, resets, paces, total, lastText, view, keep,
    hasFold: !!button, tabsShown, tabLabels: TABS.map(id => tabLabel(id, true)),
  })
  const { kind, buttonsRow, compactStep, fold: foldShown, slim = 0 } = layoutOf(columns, need)
  const minimal = kind === 'minimal'
  const foldEl = foldShown ? button : null
  noteWidth({
    body: typeof e.props.bodyColumns === 'number' ? e.props.bodyColumns : null,
    viewport: typeof e.viewport?.columns === 'number' ? e.viewport.columns : null,
    used: columns,
    kind: minimal ? 'minimal' : kind === 'stacked' ? `compact step ${compactStep}${slim ? `, slim ${slim}` : ''}` : kind,
    need: `wide ${need.wide}+${need.buttonsWide}, compact ${need.compact.join('/')}+${need.buttons}${need.slim ? `, slim ${need.slim.join('/')}+${need.buttons - need.fold}, minimal ${need.minimal}` : ''}`,
  })
  const buttons = [keepAlone ? keepMark : null]
  // Buttons that do not fit beside the row take a row of their own, right-aligned: the terminal, and the desktop
  // before the first reply. From the first reply on the desktop layoutOf never asks for one.
  const buttonsRowEl = buttonsRow ? (
    <Box key="buttons-row" flexDirection="row" paddingX={1}>
      {grow}
      {tabEls(kind === 'wide')}
      {foldEl}
      {buttons}
    </Box>
  ) : null
  // The minimal row has the fold button alone: the tabs are not drawn.
  const inlineButtons = buttonsRow ? [] : [...(minimal ? [] : tabEls(kind === 'wide')), foldEl, ...buttons]

  const running = await runningCrew($)

  // Where the request is: a segment per step when there is a list or a report to measure
  // against, one segment sweeping while a turn works with neither, nothing when idle.
  const prog = await readProgress($)
  const walking = prog && prog.total > 0 ? prog : null
  const pacing = !walking && e.props.isWorking ? await readTurn($) : null
  const theme = THEMES[await themeOf($)]
  const progressRow = progressRowOf({ ui: bandUi, kind, columns, now, walking, pacing, running, theme, onCrew: w => openOutput($, w.id, w.type) })

  const rowCtx: RowCtx = { ...tipCtx, now, list, kind, compactStep, slim, total, lastText }
  const spendBox = spendBoxOf(rowCtx)
  const pieces = { grow, inlineButtons, buttonsRowEl, progressRow, keepMark }

  if (list.length === 0 && !view) return waitingBand(rowCtx, pieces, spendBox)

  const label = usageLabel(rowCtx)
  const usage = usageOf(rowCtx, spendBox)

  // Before the first reply there is no cache to show.
  if (!view) return usageBand(rowCtx, pieces, label, usage)

  const rows = cacheRows(rowCtx, pieces, view, paid?.saved ?? 0, keep, label, usage)

  let card = null
  let showProgress = true
  if (open && Svg) {
    const paceRows = trackPace(list, now)
    const days = await readDays($, now)
    // The card is drawn at W, 12 px a column, but the band is narrower on screen (DESKTOP_COL_PX). Its
    // element gets the width it is shown at and the height that goes with it: given the drawn height, the
    // shrunk drawing sat centred in a box too tall for it, with empty bands above and below.
    // The band may be at most maxRows tall, else the host scrolls it: fitOpen drops the progress row
    // when the open band would not fit with it.
    const W = bandPx(columns)
    const scale = Math.min(1, Math.floor(columns * DESKTOP_COL_PX) / W)
    const shownH = (h: number) => Math.round(h * scale)
    const rowsAbove = (kind === 'tight' ? 2 : 1) + (buttonsRowEl ? 1 : 0)
    const maxRows = typeof e.props.maxRows === 'number' ? e.props.maxRows : Infinity
    const c = cardSvg(view, W, { main: paid?.main ?? 0, subs: paid?.subs ?? 0, days, saved: paid?.saved, pings: paid?.pings, commits: paid?.commits, prs: paid?.prs }, paceRows, metricsOf(paid, Math.max(0, view.window - view.tokens)), tab)
    const fit = fitOpen(maxRows, rowsAbove, progressRow ? BAR_H : 0, shownH(c.h))
    showProgress = fit.progress
    noteFit(`${rowsAbove}+${progressRow && fit.progress ? rowsOf(BAR_H) : 0}+${rowsOf(shownH(c.h))} of ${maxRows} rows${fit.progress ? '' : ', progress dropped'}, card ${c.cols} cols`)
    card = (
      <Box key="card" flexDirection="row">
        <Svg source={c.source} alt={c.alt} width={Math.round(c.w * scale)} height={shownH(c.h)} isInteractive={kind !== 'tight'} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {rows}
      {buttonsRowEl}
      {showProgress ? progressRow : null}
      {card}
    </Box>
  )
}
