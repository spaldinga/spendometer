// The band's row, drawn: each window as a block (wide, stacked or compact), the cost, and the cache's chip with Robo,
// assembled into the row of the chosen layout. The widths these have to fit are estimated in widths.ts.

import type { Window } from '../../types'
import { PACE_TIP, PACE_TRACK_PX, PIE_SIZE, fmtReset, paceTrackSvg, paceWords, pieSvg } from '../capacity/usage/art'
import type { PaceMode } from '../capacity/usage/art'
import { WINDOW_MS } from '../capacity/usage/pace'
import { paceFor } from '../capacity/usage/windows'
import { ROBO_SIZE, WORD, chipSvg, chipTip, roboSvg } from '../cost/cache/chip'
import { TTL_MIN, fmtIdle, mineModel } from '../cost/cache/facts'
import type { CacheView } from '../cost/cache/facts'
import { costOf, usd } from '../cost/prices'
import { COMPACT_MARGIN } from '../layout'
import type { Kind } from '../layout'
import { tip } from './buttons'
import type { TipCtx } from './buttons'
import { DANGER, EMPTY, HUE, INK, OK, ORANGE, TEXT, YELLOW } from './look'
import { CELLS, LOW_AT, NAMES, SHORT, TIGHT_CELLS, fiveAtOf } from './widths'

const LONG: Record<string, string> = { seven_day: '7-day limit', five_hour: '5-hour limit', spend_limit: 'Spend limit' }
const COLORS: Record<string, string> = { seven_day: ORANGE, five_hour: YELLOW }

const dots = (left: number, cells: number): { on: string; off: string } => {
  const n = Math.max(0, Math.min(cells, Math.round((left / 100) * cells)))
  return { on: '●'.repeat(n), off: '·'.repeat(cells - n) }
}

/** What the row's pieces are drawn from: the surface, the windows, the cost and the layout that was chosen. */
export type RowCtx = TipCtx & {
  now: number
  list: Window[]
  kind: Kind
  compactStep: number
  slim: number
  /** What the conversation has cost so far, and its last turn's cost as text; null when there was none. */
  total: number
  lastText: string | null
}

/** The elements every layout of the row shares: the spacer, the buttons, the progress row and the keep-warm mark. */
export type Pieces = {
  grow: unknown
  inlineButtons: unknown
  buttonsRowEl: unknown
  progressRow: unknown
  keepMark: unknown
}

const shapeOf = (c: RowCtx) => {
  const minimal = c.kind === 'minimal'
  return { minimal, isWide: c.kind === 'wide', isCompact: c.kind === 'stacked' || minimal, cells: c.kind === 'tight' ? TIGHT_CELLS : CELLS }
}

const parts = (c: RowCtx, w: Window) => {
  const { Svg } = c.ui
  const { now } = c
  const left = Math.max(0, Math.round((100 - w.percentUsed) * 10) / 10)
  return {
    left,
    used: Math.round((100 - left) * 10) / 10,
    col: COLORS[w.kind] ?? 'text',
    name: NAMES[w.kind] ?? w.kind.toUpperCase(),
    d: dots(left, shapeOf(c).cells),
    reset: fmtReset(w.resetsAt, now),
    tip: (() => {
      const r = fmtReset(w.resetsAt, now)
      const pace = paceFor(w, now)
      const paceTip = pace ? ` · pace ${pace.ok ? `~${pace.atReset}% at reset` : `runs out in ~${fmtIdle(pace.lastsMs)}`}.${Svg ? ` ${PACE_TIP}` : ''}` : ''
      return `${LONG[w.kind] ?? w.kind.replace(/_/g, ' ') + ' limit'} · ${Math.round((100 - left) * 10) / 10}% used, ${left}% left${r ? ` · ${r === 'resetting' ? 'resetting now' : `resets in ${r}`}` : ''}${paceTip}`
    })(),
  }
}

// The pie beside a window on the desktop: what is used, in the window's colour. The terminal has none.
const pie = (c: RowCtx, w: Window, p: ReturnType<typeof parts>, i: number) => {
  const { Svg } = c.ui
  return Svg ? <Svg key={`pie-${i}`} source={pieSvg(p.used, COLORS[w.kind] ?? TEXT)} alt={`${p.name} ${p.used}% used`} width={PIE_SIZE} height={PIE_SIZE} /> : null
}

// The 5h pace after the percent: the mini track on the desktop (fill = used, tick = time gone), then words.
const paceEls = (c: RowCtx, w: Window, p: ReturnType<typeof parts>, mode: PaceMode, full = true) => {
  const { Box, Text, Svg } = c.ui
  const pc = paceFor(w, c.now)
  if (!pc) return []
  const pw = paceWords(pc, mode, full)
  const els = []
  if (Svg) {
    const tr = paceTrackSvg(p.used, 1 - pc.untilResetMs / WINDOW_MS[w.kind], p.col, pc.ok, PACE_TRACK_PX[mode])
    els.push(
      <Box key="pace-track" marginLeft={1}>
        <Svg source={tr.source} alt={`${p.name} pace: ${p.used}% of the limit used`} width={tr.w} height={tr.h} />
      </Box>,
    )
  }
  if (pw.text) els.push(<Text key="pace-text" color={pw.ok ? 'subtle' : DANGER} bold={!pw.ok}>{` ${pw.text}`}</Text>)
  if (pw.mark) els.push(<Text key="pace-mark" color={OK} bold>{` ${pw.mark}`}</Text>)
  return els
}

// Wide: every window on one row. Narrow: each window is a block of three
// lines (name and pie, percent used, reset time) so nothing wraps or clips. The terminal keeps dots and percent left.
const wide = (c: RowCtx, w: Window, i: number) => {
  const { Box, Text, Svg } = c.ui
  const p = parts(c, w)
  return (
    <Box key={`w-${i}`} flexDirection="row" flexShrink={0} marginRight={3} alignItems="center">
      <Text color="subtle" bold>{p.name} </Text>
      {Svg ? (
        pie(c, w, p, i)
      ) : (
        <>
          <Text color={p.col}>{p.d.on}</Text>
          <Text color={EMPTY}>{p.d.off}</Text>
        </>
      )}
      <Text color={p.col} bold> {Svg ? `${p.used}% used` : `${p.left}% left`}</Text>
      {p.left < LOW_AT ? <Text color="text" bold> LOW</Text> : null}
      {p.reset && !(Svg && paceFor(w, c.now)) ? <Text color="subtle"> · {p.reset}</Text> : null}
      {paceEls(c, w, p, 'wide')}
      {tip(c, p.tip, 'left')}
    </Box>
  )
}

const stacked = (c: RowCtx, w: Window, i: number) => {
  const { Box, Text, Svg } = c.ui
  const p = parts(c, w)
  return (
    <Box key={`w-${i}`} flexDirection="column" flexShrink={0} marginRight={3}>
      <Box flexDirection="row" alignItems="center">
        <Text color="subtle" bold>{p.name} </Text>
        {Svg ? (
          pie(c, w, p, i)
        ) : (
          <>
            <Text color={p.col}>{p.d.on}</Text>
            <Text color={EMPTY}>{p.d.off}</Text>
          </>
        )}
        {paceEls(c, w, p, 'tight')}
      </Box>
      <Box flexDirection="row">
        <Text color={p.col} bold>{Svg ? `${p.used}% used` : `${p.left}% left`}</Text>
        {p.left < LOW_AT ? <Text color="text" bold> LOW</Text> : null}
      </Box>
      {p.reset ? <Text color="subtle">resets {p.reset}</Text> : null}
      {tip(c, p.tip, 'left')}
    </Box>
  )
}

// Compact: only what is used of each window, in its colour; the desktop puts a pie before the percent.
const compact = (c: RowCtx, w: Window, i: number) => {
  const { Box, Text, Svg } = c.ui
  const { compactStep, slim } = c
  const p = parts(c, w)
  return (
    <Box key={`w-${i}`} flexDirection="row" flexShrink={0} marginRight={COMPACT_MARGIN} alignItems="center">
      {compactStep < 4 && SHORT[w.kind] ? <Text color="subtle">{SHORT[w.kind]} </Text> : null}
      {Svg ? <Box key="pie-gap" marginRight={1}>{pie(c, w, p, i)}</Box> : null}
      <Text color={p.col} bold>{`${p.used}%`}</Text>
      {p.left < LOW_AT ? <Text color="text" bold> LOW</Text> : null}
      {slim ? null : paceEls(c, w, p, 'compact', compactStep < 2)}
      {tip(c, p.tip, 'left')}
    </Box>
  )
}

/** The cost box beside the windows: the total, and on the wider layouts the last turn's cost. Null when there is none to show. */
export function spendBoxOf(c: RowCtx) {
  const { Box, Text } = c.ui
  const { total, lastText, compactStep } = c
  const { isWide, isCompact } = shapeOf(c)
  return total <= 0 || (isCompact && compactStep >= 2) ? null : isCompact ? (
    <Box key="spend" flexShrink={0} marginRight={COMPACT_MARGIN}>
      <Text key="spend-total" color="text" bold>{`≈${usd(total)}`}</Text>
    </Box>
  ) : (
    <Box key="spend" flexDirection={isWide ? 'row' : 'column'} flexShrink={0} marginRight={3}>
      <Text color="subtle" bold>{isWide ? 'COST ' : 'COST'}</Text>
      <Text key="spend-total" color="text" bold>{`≈${usd(total)}`}</Text>
      {lastText ? <Text key="spend-last" color="subtle">{isWide ? ` · last ${lastText}` : `last ${lastText}`}</Text> : null}
    </Box>
  )
}

/** The USAGE label; the compact row has none. */
export function usageLabel(c: RowCtx) {
  const { Box, Text } = c.ui
  const { isWide, isCompact } = shapeOf(c)
  return isCompact ? null : (
    <Box key="label" flexShrink={0} marginRight={isWide ? 2 : 3}>
      <Text color="text" bold>USAGE</Text>
    </Box>
  )
}

/** Each window's block in the chosen layout, then the cost box. */
export function usageOf(c: RowCtx, spendBox: unknown) {
  const { Box, Text } = c.ui
  const { list, slim } = c
  const { isWide, isCompact } = shapeOf(c)
  const fiveAt = fiveAtOf(list)
  return [
    ...(list.length > 0
      ? list.map((w, i) => (slim >= 3 && i !== fiveAt ? null : (isWide ? wide : isCompact ? compact : stacked)(c, w, i)))
      : isCompact ? [] : [<Box key="wait" flexShrink={0} marginRight={3}><Text color="subtle">waiting for the first reply</Text></Box>]),
    spendBox,
  ]
}

/** The band before the first reply, with neither windows nor a cache: the waiting line, the cost, the buttons. */
export function waitingBand(c: RowCtx, p: Pieces, spendBox: unknown) {
  const { Box, Text } = c.ui
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" paddingX={1}>
        <Text color="subtle">USAGE · waiting for the first reply</Text>
        {spendBox ? <Box key="wait-spend" marginLeft={2}>{spendBox}</Box> : null}
        {p.grow}
        {p.inlineButtons}
      </Box>
      {p.buttonsRowEl}
      {p.progressRow}
    </Box>
  )
}

/** The band with windows but no cache yet. */
export function usageBand(c: RowCtx, p: Pieces, label: unknown, usage: unknown) {
  const { Box } = c.ui
  return (
    <Box flexDirection="column">
      <Box key="row" flexDirection="row" paddingX={1}>
        {label}
        {usage}
        {p.grow}
        {p.inlineButtons}
      </Box>
      {p.buttonsRowEl}
      {p.progressRow}
    </Box>
  )
}

/**
 * The row for the chosen layout with the cache beside the windows: the chip (WARM or COLD) with Robo and the next
 * message's cost, the keep-warm mark and the buttons. `saved` and `keep` are for the chip's hover.
 */
export function cacheRows(c: RowCtx, p: Pieces, view: CacheView, saved: number, keep: boolean | null, label: unknown, usage: unknown) {
  const { Box, Text, Svg } = c.ui
  const { kind, compactStep, slim } = c
  const { minimal } = shapeOf(c)
  const { grow, inlineButtons, keepMark } = p
  const mode = view.mode
  const cold = mode === 'cold'
  const hue = HUE[mode]
  const mine = mineModel(view)

  const chip = Svg
    ? (() => {
        const ch = chipSvg(mode)
        return <Svg key="chip" source={ch.source} alt={WORD[mode]} width={ch.w} height={ch.h} />
      })()
    : <Text key="chip" backgroundColor={hue} color={INK} bold>{` ${WORD[mode]} `}</Text>
  // Compact step 3 and up: Robo alone (the terminal: a one-letter chip) in place of the chip.
  const compactChip =
    compactStep < 3
      ? chip
      : Svg
        ? <Svg key="robo" source={roboSvg(mode)} alt={cold ? 'Robo, frozen' : 'Robo, bobbing'} width={ROBO_SIZE} height={ROBO_SIZE} isInteractive />
        : <Text key="chip" backgroundColor={hue} color={INK} bold>{` ${WORD[mode][0]} `}</Text>
  // The next message's cost: always at step 0, after that only while cold.
  const showNext = !minimal && mine !== undefined && (compactStep === 0 || cold)
  const badge = Svg
    ? [
        <Svg key="robo" source={roboSvg(mode)} alt={cold ? 'Robo, frozen' : 'Robo, bobbing'} width={ROBO_SIZE} height={ROBO_SIZE} isInteractive />,
        <Text key="gap"> </Text>,
        chip,
      ]
    : [chip]

  const summary = cold
    ? [
        <Text key="idle" color={hue} bold>{` ${view.idle}`}</Text>,
        mine ? <Text key="dot" color="subtle"> · </Text> : null,
        mine ? <Text key="cost" color="text" bold>{usd(costOf(mine, mode, view.tokens))}</Text> : null,
      ]
    : [<Text key="left" color={hue} bold>{` ${Math.max(0, TTL_MIN - view.idleMin)}m left`}</Text>]

  // The chip's hover: what keeping warm costs and what going cold would cost (the card no longer has a column for it).
  const chipHover = tip(c, chipTip(view, saved, keep), 'left')

  if (kind === 'wide') {
    return (
      <Box key="row" flexDirection="row" paddingX={1} alignItems="center">
        {label}
        {usage}
        {/* WARM or COLD stays in the row whether the card is open or not. */}
        {(
          <Box key="inline" flexDirection="row" flexShrink={0} marginRight={2} alignItems="center">
            <Box key="chip-group" flexDirection="row" alignItems="center">
              {badge}
              {summary}
              {chipHover}
            </Box>
            {keepMark}
          </Box>
        )}
        {grow}
        {inlineButtons}
      </Box>
    )
  }
  if (kind === 'stacked' || minimal) {
    // Compact: one line, the chip and the next message's cost standing in for the cache block.
    return (
      <Box key="row" flexDirection="row" paddingX={1} alignItems="center">
        {usage}
        {(
          <Box key="block" flexDirection="row" flexShrink={0} marginRight={COMPACT_MARGIN} alignItems="center">
            <Box key="chip-group" flexDirection="row" alignItems="center">
              {compactChip}
              {showNext ? <Text key="next-gap"> </Text> : null}
              {showNext && mine ? <Text key="next-cost" color="text" bold>{usd(costOf(mine, mode, view.tokens))}</Text> : null}
              {showNext ? <Text key="next" color="subtle"> next</Text> : null}
              {chipHover}
            </Box>
            {slim >= 2 ? null : keepMark}
          </Box>
        )}
        {grow}
        {inlineButtons}
      </Box>
    )
  }
  // Narrow: the cache gets its own row under the usage blocks.
  return [
    <Box key="row" flexDirection="row" paddingX={1}>
      {label}
      {usage}
    </Box>,
    <Box key="cache" flexDirection="row" paddingX={1} alignItems="center">
      <Box key="chip-group" flexDirection="row" alignItems="center">
        {badge}
        {summary}
        {chipHover}
      </Box>
      {keepMark}
      {grow}
      {inlineButtons}
    </Box>,
  ]
}
