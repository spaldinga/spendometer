// The cache card's drawings. Pure: each function returns an SVG string the band
// hands to Svg. Nothing here touches the engine.

import { TEXT, MUTED, kitOf, svgDoc } from './look'
import type { Mode } from './look'
import { modelName, tok, usd } from '../cost/prices'
import { cheaperModels, keepWarmCost } from '../cost/cache/chip'
import { TTL_MIN, mineModel } from '../cost/cache/facts'
import type { CacheView } from '../cost/cache/facts'
export type { Mode } from './look'
import { runwayOf, sizeZone, toolsZone } from '../capacity/context/card'
import type { Metrics } from './card-metrics'
import { cardColsOf } from '../layout'
import { resultsSentence } from '../cost/spend/results'
import { PACE_TIP, fmtSpan } from '../capacity/usage/art'
import type { PaceRow } from '../capacity/usage/art'
import { paceStrip } from '../capacity/usage/card'
import { avgZone, delegZone, modelsZone, spendFiguresOf, spendZone } from '../cost/spend/card'
import type { CardSpend } from '../cost/spend/card'
import { discountZone } from '../cost/cache/card'

export { MODEL_COLOR } from '../cost/spend/card'
export type { CardSpend } from '../cost/spend/card'

// ---------- The card, laid out for the band's width ----------

/** The card's tabs, and how they are named. */
export type Tab = 'overview' | 'context' | 'cost'
export const TABS: readonly Tab[] = ['overview', 'context', 'cost']
export const TAB_NAMES: Record<Tab, string> = { overview: 'Overview', context: 'Context', cost: 'Cost' }

/** The gap between the row and the card, drawn inside the card. */
const CARD_TOP = 6

/** The pace strip's height: its title and two one-line rows. */
const PACE_H = 88
/** The row of columns: 124 px, the runway line's room included. */
const ROW = 124
/** A status line's pitch, and what a block of them takes under its rule: the first baseline 24 px down, 7 px under the last. */
const STATUS_PITCH = 27
const statusH = (lines: number): number => STATUS_PITCH * lines + 4

/** The columns: the margin at each side and the gap between columns (px). */
const SIDE = 13
const COL_GAP = 26
/** The divider between columns: its top below the row's top and its height (px). */
const VLINE_DY = 18
const VLINE_H = 88
/** The status lines: the width under which the text is 16 px instead of 18, the two sizes, the room kept beside the line (px), and the first baseline below the rule (px). */
const NARROW_W = 560
const STATUS_SIZE_NARROW = 16
const STATUS_SIZE = 18
const STATUS_ROOM_PAD = 14
const STATUS_BASE_DY = 24
/** A status line's dot: its centre x, radius, rise above the baseline as a share of the font size, and the text's x (px). */
const DOT_CX = 17
const DOT_R = 4
const DOT_RISE = 0.36
const STATUS_TEXT_X = 27

// The card shows one tab at a time (Overview, Context or Cost). Overview is the pace strip across the top and
// under it DELEGATION and SPEND; Context is CONVERSATION SIZE (RE-CACHE once cold) and TOOL OUTPUT; Cost is
// CACHE DISCOUNT, PER MESSAGE and BY MODEL. Each takes as many columns as it has zones and fit (cardColsOf);
// a zone with no column of its own is a status line below. Keep warm is the chip's hover and the alt text,
// not a zone. The height depends on the width and the tab only, never on the data.
export const cardSvg = (v: CacheView, W: number, spend: CardSpend | null = null, pace: readonly PaceRow[] = [], metrics: Metrics | null = null, tab: Tab = 'overview'): { source: string; w: number; h: number; alt: string; cols: number } => {
  const mode = v.mode
  const cold = mode === 'cold'
  const kit = kitOf(W, mode)
  const { esc, t, vline, hline, pick, famName } = kit

  const spendFigures = spendFiguresOf(spend)
  const { main: mainCost, subs: subsCost, total, days, today, week, spendCaptions, commits, prs, perResult, resultCaptions } = spendFigures
  const free = Math.max(0, v.window - v.tokens)

  // The runway as a second caption line under IN CACHE, once the context growth is known.
  const { turns: runwayTurns, line: runwayLine } = runwayOf(metrics?.runway ?? null, metrics?.growth ?? null)

  // The keep-warm figures: no column on the card any more (they are the chip's hover), only the alt text.
  const own = mineModel(v)
  const name = modelName
  const cheaper = cheaperModels(v)
  const kw = keepWarmCost(v)
  const saved = spend?.saved ?? 0

  // One tab at a time. A zone is its drawing and, for a card too narrow for its column, the line it becomes below.
  type Zone = { draw: (x: number, y: number, w: number) => string; status?: { dot: string; variants: string[] } }
  const spendHead = `≈${usd(total)} this thread`
  const mm = metrics
  const modelsLine = mm && mm.models.length ? mm.models.map(([id, c]) => `${famName(id)} ${usd(c)}`) : []
  const zonesOf = (which: Tab): Zone[] =>
    which === 'overview'
      ? [
          { draw: (x, y, w) => delegZone(kit, x, y, w, metrics) },
          { draw: (x, y, w) => spendZone(kit, x, y, w, spendFigures), status: { dot: MUTED, variants: [...(resultCaptions.length ? resultCaptions.map(c => `${spendHead} · ${c}`) : []), ...spendCaptions.map(c => `${spendHead} · ${c}`), spendHead, `≈${usd(total)}`] } },
        ]
      : which === 'context'
        ? [
            { draw: (x, y, w) => sizeZone(kit, x, y, w, { tokens: v.tokens, window: v.window, cold, runway: runwayLine ? [runwayLine, `${runwayTurns} turns left`] : [] }) },
            {
              draw: (x, y, w) => toolsZone(kit, x, y, w, metrics),
              status: {
                dot: MUTED,
                variants:
                  mm && mm.toolTok > 0
                    ? [
                        `tool output ${tok(mm.toolTok)} tokens` + (mm.tools.length ? ` · ${mm.tools.map(([k, n]) => `${k} ${tok(n)}`).join(' · ')}` : '') + (mm.rereads > 0 ? ` · ${mm.rereads} re-read${mm.rereads === 1 ? '' : 's'}` : ''),
                        `tool output ${tok(mm.toolTok)} tokens` + (mm.rereads > 0 ? ` · ${mm.rereads} re-read${mm.rereads === 1 ? '' : 's'}` : ''),
                        `tool output ${tok(mm.toolTok)} tokens`,
                      ]
                    : ['tool output: after a few turns'],
              },
            },
          ]
        : [
            { draw: (x, y, w) => discountZone(kit, x, y, w, metrics), status: { dot: MUTED, variants: mm && mm.hit !== null ? [`cache discount ${Math.round(mm.hit * 100)}%` + (mm.perM !== null ? ` · ${usd(mm.perM)} per 1M tokens` : ''), `cache discount ${Math.round(mm.hit * 100)}%`] : ['cache discount: after a few turns'] } },
            {
              draw: (x, y, w) => avgZone(kit, x, y, w, metrics),
              status: {
                dot: MUTED,
                variants:
                  mm && mm.avg !== null
                    ? [
                        `per message ${usd(mm.avg)} avg` + (mm.last !== null ? ` · last ${usd(mm.last)}` : '') + (mm.multiple !== null ? ` · ${mm.multiple}× avg` : ''),
                        `per message ${usd(mm.avg)} avg`,
                      ]
                    : ['per message: after a few turns'],
              },
            },
            { draw: (x, y, w) => modelsZone(kit, x, y, w, metrics?.models ?? []), status: { dot: MUTED, variants: modelsLine.length ? [`by model ${modelsLine.join(' · ')}`, `by model ${modelsLine.slice(0, 2).join(' · ')}`, `by model ${modelsLine[0]}`] : ['by model: after a few turns'] } },
          ]
  const zones = zonesOf(tab)

  // The columns: as many as fit, at most one a zone, 26 px between them, 13 px at the sides.
  const n = Math.min(zones.length, cardColsOf(W))
  const colW = Math.floor((W - 2 * SIDE - (n - 1) * COL_GAP) / n)
  const colX = (i: number) => SIDE + i * (colW + COL_GAP)
  // Only Overview has the pace strip; the others start at the top.
  const yc = tab === 'overview' ? PACE_H : 0
  let g = tab === 'overview' ? paceStrip(kit, pace) + hline(PACE_H) : ''
  for (let i = 0; i < n; i++) g += (i ? vline(colX(i) - SIDE, yc + VLINE_DY, VLINE_H) : '') + zones[i].draw(colX(i), yc, colW)
  let H = yc + ROW

  // The zones with no column of their own, one status line each: a small dot, then the text. The text is the
  // longest variant that fits the line.
  const SS = W < NARROW_W ? STATUS_SIZE_NARROW : STATUS_SIZE
  const lineRoom = W - 2 * SIDE - STATUS_ROOM_PAD
  const status = zones.slice(n).flatMap(z => (z.status ? [z.status] : []))
  if (status.length) {
    g += hline(H)
    status.forEach((s, k) => {
      const yy = H + STATUS_BASE_DY + k * STATUS_PITCH
      g += `<circle cx="${DOT_CX}" cy="${yy - Math.round(SS * DOT_RISE)}" r="${DOT_R}" fill="${s.dot}"/>` + t(STATUS_TEXT_X, yy, esc(pick(s.variants, lineRoom, SS)), { size: SS, w: 600, fill: TEXT })
    })
    H += statusH(status.length)
  }

  const h = H + CARD_TOP
  const body = `<g transform="translate(0 ${CARD_TOP})">` + hline(0) + g + '</g>'
  // What the tabs draw as shapes, in words, whichever tab is shown: the per-type subagent costs live only here.
  const m = metrics
  const delegAlt = metrics?.deleg
    ? ` Delegating saved about ${usd(metrics.deleg.saved)}; subagents ran ${fmtSpan(metrics.deleg.workMs)} of work in ${fmtSpan(metrics.deleg.wallMs)}.`
    : ''
  const metricsAlt = m
    ? (m.perM !== null ? ` Effective price about ${usd(m.perM)} per million tokens.` : '') +
      (m.models.length ? ` Cost by model: ${m.models.map(([id, c]) => `${famName(id)} ${usd(c)}`).join(', ')}.` : '') +
      (m.subs > 0 ? ` Subagents cost ${usd(m.subs)}${m.top.length ? ` (${m.top.map(([k, c]) => `${k} ${usd(c)}`).join(', ')})` : ''}.` : '') +
      (m.toolTok > 0
        ? ` Tool output into the context: about ${tok(m.toolTok)} tokens${m.tools.length ? ` (${m.tools.map(([k, n]) => `${k} ${tok(n)}`).join(', ')})` : ''}` +
          (m.rereads > 0 ? `; ${m.rereads} re-read${m.rereads === 1 ? '' : 's'} of unchanged files, about ${tok(m.rereadTok)} tokens` : '') +
          '.'
        : '') +
      delegAlt +
      (runwayLine ? ` Context runway: ${runwayLine}.` : '')
    : delegAlt
  const alt =
    `Tab: ${TAB_NAMES[tab]}. ` +
    (cold
      ? `Cache cold. Idle ${v.idle}. Next message re-caches ${tok(v.tokens)} tokens.`
      : `Cache warm. Goes cold in ${Math.max(0, TTL_MIN - v.idleMin)} minutes. ${tok(v.tokens)} tokens cached.`) +
    ` ${tok(free)} of the context free.` +
    ` This conversation has cost about ${usd(total)}${total > 0 ? ` (main ${usd(mainCost)}, subagents ${usd(subsCost)})` : ''}.` +
    (days ? ` Spend today ${usd(today)}, this week ${usd(week)}.` : '') +
    resultsSentence(commits, prs, perResult !== null ? usd(perResult) : null) +
    (saved > 0 ? ` Keep-warm pings have saved about ${usd(saved)}.` : '') +
    (kw ? ` Keeping the cache warm costs about ${usd(kw.perHour)} an hour; ${cold ? `re-caching now costs ${usd(kw.cold)} on ${name(own!)}${cheaper.length ? ` (cheaper: ${cheaper.join(', ')})` : ''}` : `going cold costs ${usd(kw.cold)}`}.` : '') +
    metricsAlt +
    (tab === 'overview' && pace.length > 0 ? ` ${PACE_TIP}` : '')
  return { source: svgDoc(W, h, body, true), w: W, h, alt, cols: n }
}
