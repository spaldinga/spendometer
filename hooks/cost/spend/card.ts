// The spend slice's zones of the card: SPEND, DELEGATION, PER MESSAGE and BY MODEL. Pure: each returns an SVG
// string the band places.

import { DANGER, EMPTY, FABLE, HUE, MUTED, OK, ORANGE, TEXT, YELLOW } from '../../band/look'
import type { Kit } from '../../band/look'
import { fmtIdle } from '../cache/facts'
import { usd } from '../prices'
import { outlierMultiple } from './metrics'
import type { Delegation } from './metrics'
import { resultsText } from './results'

// Geometry of the zones, in px of the card's SVG; y offsets count from the zone's top.
/** Baseline of a zone's heading (SPEND, DELEGATION), and its font size and letter spacing. */
const HEAD_DY = 24
const HEAD_SIZE = 14
const HEAD_LS = 1.4
/** The figure's font size, and the font size of the unit beside it (saved, avg, this thread). */
const FIG_SIZE = 38
const FIG_UNIT_SIZE = 15
/** Baseline of the figure, and of the caption line under the chart (px below the zone's top). */
const FIG_DY = 62
const CAP_DY = 108
/** The SPEND zone with a results line: figure, day bars (baseline and tallest bar), dots (top), caption and results line baselines (px). */
const FIG_UP_DY = 60
const RES_BARS_DY = 80
const RES_BARS_H = 12
const RES_DOTS_DY = 68
const RES_CAP_DY = 98
const RES_LINE_DY = 118
/** The SPEND zone without it: day bars (baseline and tallest bar) and dots (top), px. */
const BARS_DY = 90
const BARS_H = 20
const DOTS_DY = 80
/** Day bars: gap and width between and of the bars, height of the shortest bar with spend and of a day with none (px). */
const DAY_GAP = 4
const DAY_BAR_W = 12
/** PER MESSAGE shows this many bars at most, so a bar is sized to leave room for all of them. */
const RECENT_SLOTS = 10
const DAY_MIN_H = 3
const DAY_STUB_H = 2
/** The dot chart: pitch of a dot (px), rows, and the fewest and most columns. */
const DOT_PITCH = 9.6
const DOT_ROWS = 2
const MIN_COLS = 10
const MAX_COLS = 25
/** DELEGATION: width of a character as a share of its font size (figure, unit), the gap before the unit (px), and the room left of the compare rows (px). */
const FIG_CHAR_W = 0.6
const UNIT_CHAR_W = 0.56
const FIG_UNIT_GAP = 7
const COMPARE_PAD = 16
/** DELEGATION compare rows: label width (px), narrowest bar that is drawn (px), label font size, bar height (px), and the rows' tops. */
const COMPARE_LABEL_W = 40
const COMPARE_MIN_W = 30
const COMPARE_LABEL_SIZE = 14
const COMPARE_BAR_H = 6
const COST_ROW_DY = 40
const TIME_ROW_DY = 56
/** BY MODEL: gap before the share's percentage (px), the split bar's top (px below the zone's top) and height (px). */
const FIG_PCT_DX = 10
const SPLIT_BAR_DY = 78
const SPLIT_BAR_H = 6

/** Each model family's colour in the by-model split. */
export const MODEL_COLOR: Record<string, string> = { opus: HUE.warm, sonnet: ORANGE, haiku: YELLOW, fable: FABLE }

/**
 * What this conversation has cost so far, split the way the card shows it; `days` is the account's daily
 * spend for the last 7 days, oldest first, today last; `saved` and `pings` are what keep-warm pings saved
 * and cost in this conversation.
 */
export type CardSpend = { main: number; subs: number; days?: number[]; saved?: number; pings?: number; commits?: number; prs?: number }

// A copy of capacity/usage/art's fmtSpan: a domain imports no other domain.
/** A run time written out: 45s, 12m, 2h 5m. */
const fmtSpan = (ms: number): string => (ms < 60000 ? `${Math.max(0, Math.round(ms / 1000))}s` : fmtIdle(ms))

/** What the SPEND zone, its status line and the alt text read from the card's spend figures. */
export type SpendFigures = {
  main: number
  subs: number
  total: number
  /** The account's last 7 days, when any of it is above zero. */
  days: number[] | null
  today: number
  week: number
  /** What the zone and its status line add to the total: the days, or the split of main and subagents; none when nothing is spent. */
  spendCaptions: string[]
  commits: number
  prs: number
  /** What a commit or pull request cost, when there is one. */
  perResult: number | null
  /** The results caption lines, longest first. */
  resultCaptions: string[]
}

/** The figures of a card's spend; all zero and empty when the card knows none. */
export const spendFiguresOf = (spend: CardSpend | null): SpendFigures => {
  const main = spend?.main ?? 0
  const subs = spend?.subs ?? 0
  const total = main + subs

  // The account's spend over the last 7 days, when the card knows it and any of it is above zero.
  const days = spend?.days && spend.days.some(d => d > 0) ? spend.days.slice(-7) : null
  const today = days ? days[days.length - 1] : 0
  const week = days ? days.reduce((a, b) => a + b, 0) : 0
  const daysCaption = days ? `today ${usd(today)} · week ${usd(week)}` : ''
  const spendCaptions = days ? [daysCaption] : total > 0 ? [`main ${usd(main)} · subagents ${usd(subs)}`, `main ${usd(main)} · subs ${usd(subs)}`] : []

  // The commits and pull requests this conversation made, and what a result cost: its own caption line in the
  // SPEND column (longest first) and a lead for the status line.
  const commits = Math.max(0, spend?.commits ?? 0)
  const prs = Math.max(0, spend?.prs ?? 0)
  const results = commits + prs
  const resultsBase = results > 0 ? resultsText(commits, prs) : ''
  const perResult = results > 0 && total > 0 ? total / results : null
  const resultCaptions = results > 0 ? [...(perResult !== null ? [`${resultsBase} · ≈${usd(perResult)} a result`, `${resultsBase} · ${usd(perResult)} each`] : []), resultsBase] : []
  return { main, subs, total, days, today, week, spendCaptions, commits, prs, perResult, resultCaptions }
}

/** One bar a day, oldest to today, scaled to the busiest; today in the band's orange, a day with no spend a 2 px stub. */
const dayBars = (days: number[] | null, x: number, base: number, maxH: number) => {
  if (!days) return ''
  const gap = DAY_GAP
  const bw = DAY_BAR_W
  const top = Math.max(...days)
  return days
    .map((d, i) => {
      const h = d > 0 ? Math.max(DAY_MIN_H, Math.round((d / top) * maxH)) : DAY_STUB_H
      const fill = d <= 0 ? EMPTY : i === days.length - 1 ? ORANGE : MUTED
      return `<rect x="${x + i * (bw + gap)}" y="${base - h}" width="${bw}" height="${h}" rx="1" fill="${fill}"/>`
    })
    .join('')
}

// What is spent: this thread's total, and either the last 7 days as bars or, with no daily figures, dots
// split between the main session and subagents.
export const spendZone = (k: Kit, x: number, y: number, w: number, f: SpendFigures): string => {
  const { t, big, dots, capPick, capSize, esc, HUEM } = k
  const { total, days, spendCaptions, resultCaptions } = f
  const subsCost = f.subs
  const caption = spendCaptions.length ? capPick(spendCaptions, w, capSize(w)) : ''
  const g = t(x, y + HEAD_DY, 'SPEND', { size: HEAD_SIZE, ls: HEAD_LS })
  const fig = `≈${usd(total)}`
  const split = (n: number) => {
    // The subagents' share, at least one dot once they have cost anything.
    const subDots = total <= 0 || subsCost <= 0 ? 0 : Math.min(n - 1, Math.max(1, Math.round((subsCost / total) * n)))
    return (i: number) => (total <= 0 ? EMPTY : i < n - subDots ? HUEM : MUTED)
  }
  const cols = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor(w / DOT_PITCH)))
  // With the results line the figure, chart and first caption move up, as in IN CACHE with its runway line.
  if (resultCaptions.length) {
    const chart = days ? dayBars(days, x, y + RES_BARS_DY, RES_BARS_H) : dots(x, y + RES_DOTS_DY, cols, DOT_PITCH, DOT_ROWS, split(cols * DOT_ROWS))
    return (
      g +
      big(x, y + FIG_UP_DY, fig, FIG_SIZE, 'this thread', FIG_UNIT_SIZE) +
      chart +
      (caption ? t(x, y + RES_CAP_DY, caption, { size: capSize(w), w: 500 }) : '') +
      t(x, y + RES_LINE_DY, esc(capPick(resultCaptions, w, capSize(w))), { size: capSize(w), w: 500 })
    )
  }
  const chart = days ? dayBars(days, x, y + BARS_DY, BARS_H) : dots(x, y + DOTS_DY, cols, DOT_PITCH, DOT_ROWS, split(cols * DOT_ROWS))
  return g + big(x, y + FIG_DY, fig, FIG_SIZE, 'this thread', FIG_UNIT_SIZE) + chart + (caption ? t(x, y + CAP_DY, caption, { size: capSize(w), w: 500 }) : '')
}

/**
 * Two compare rows (label, track, fill as a share of the track) right of a zone's figure `figW` px wide, at the
 * cost and time row heights; empty when the room left is under the minimum. Used by DELEGATION and CACHE DISCOUNT.
 */
export const compareRows = (k: Kit, x: number, y: number, w: number, figW: number, rows: [string, number | null, string][]): string => {
  const rx = x + Math.max(Math.round(figW) + COMPARE_PAD, Math.round(w / 2))
  const tx = rx + COMPARE_LABEL_W
  const tw = x + w - tx
  if (tw < COMPARE_MIN_W) return ''
  return rows
    .map(([label, ratio, fill], i) => {
      const ty = y + (i === 0 ? COST_ROW_DY : TIME_ROW_DY)
      const fw = ratio === null ? 0 : Math.min(tw, Math.max(ratio > 0 ? 3 : 0, Math.round(ratio * tw)))
      return (
        k.t(rx, ty + COMPARE_BAR_H, label, { size: COMPARE_LABEL_SIZE, w: 600 }) +
        `<rect x="${tx}" y="${ty}" width="${tw}" height="${COMPARE_BAR_H}" rx="${COMPARE_BAR_H / 2}" fill="${EMPTY}"/>` +
        (fw > 0 ? `<rect x="${tx}" y="${ty}" width="${fw}" height="${COMPARE_BAR_H}" rx="${COMPARE_BAR_H / 2}" fill="${fill}"/>` : '')
      )
    })
    .join('')
}

/** The width of a figure with its unit beside it, as the zones estimate it (px): `unit` is '' for none. */
export const figureWidth = (figure: string, unit: string): number =>
  figure.length * FIG_SIZE * FIG_CHAR_W + (unit ? FIG_UNIT_GAP + unit.length * FIG_UNIT_SIZE * UNIT_CHAR_W : 0)

// DELEGATION: what subagents saved, two compare rows (cost and time against doing it all on the main model, one
// after another) beside the figure, and the work done against the time it took. While the figure is unknown it
// shows a dash and says when it will not be.
export const delegZone = (k: Kit, x: number, y: number, w: number, metrics: { deleg: Delegation | null; subs: number } | null): string => {
  const { t, big, capPick, capSize, esc } = k
  const g = t(x, y + HEAD_DY, 'DELEGATION', { size: HEAD_SIZE, ls: HEAD_LS })
  const cap = capSize(w)
  const words = (s: string) => t(x, y + CAP_DY, esc(s), { size: cap, w: 500 })
  const dash = big(x, y + FIG_DY, '—', FIG_SIZE, '', FIG_UNIT_SIZE)
  if (!metrics) return g + dash + words('after a few turns')
  const d = metrics.deleg
  if (!d) return g + dash + words(capPick(metrics.subs > 0 ? ['tracked from the next subagent', 'tracked from next subagent'] : ['no subagents this thread'], w, cap))
  const figure = `≈${usd(d.saved)}`
  const figW = figureWidth(figure, 'saved')
  const rows = compareRows(k, x, y, w, figW, [
    ['cost', d.costRatio, ORANGE],
    ['time', d.workMs > 0 && d.wallMs > 0 ? Math.min(1, d.wallMs / d.workMs) : null, YELLOW],
  ])
  const speed = d.workMs > 0 && d.wallMs > 0 ? (d.workMs / d.wallMs).toFixed(1) : null
  const variants =
    speed === null
      ? ['run time not recorded']
      : [
          `${fmtSpan(d.workMs)} of agent work in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
          `${fmtSpan(d.workMs)} work in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
          `${fmtSpan(d.workMs)} in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
        ]
  return g + big(x, y + FIG_DY, figure, FIG_SIZE, 'saved', FIG_UNIT_SIZE, OK) + rows + words(capPick(variants, w, cap))
}

// PER MESSAGE: the average cost of a message; the last one is the caption, flagged in the danger colour when it is far above the average.
export const avgZone = (k: Kit, x: number, y: number, w: number, metrics: { avg: number | null; last: number | null; multiple: number | null; turns?: number; recent?: number[] } | null): string => {
  const { big, capSize, mdash, mhead } = k
  if (!metrics || metrics.avg === null) return mdash(x, y, w, 'PER MESSAGE')
  const last =
    metrics.last === null
      ? ''
      : `<text x="${x}" y="${y + CAP_DY}" font-size="${capSize(w)}" font-weight="500" fill="${MUTED}">last ${usd(metrics.last)}` +
        (metrics.multiple !== null ? `<tspan fill="${DANGER}" font-weight="700"> · ${metrics.multiple}× avg</tspan>` : '') +
        '</text>'
  return mhead(x, y, 'PER MESSAGE') + big(x, y + FIG_DY, usd(metrics.avg), FIG_SIZE, 'avg', FIG_UNIT_SIZE) + messageBars(metrics.recent ?? [], metrics.avg, metrics.turns, x, y + BARS_DY, w) + last
}

/** One bar per recent message, oldest left, scaled to the dearest: an outlier in the danger colour, else the last in orange. `turns` is the conversation's, as in the caption (the bars alone may be fewer). */
const messageBars = (recent: number[], avg: number, turns: number | undefined, x: number, base: number, w: number): string => {
  if (recent.length === 0) return ''
  const bw = Math.min(DAY_BAR_W, Math.floor((w - (RECENT_SLOTS - 1) * DAY_GAP) / RECENT_SLOTS))
  const top = Math.max(...recent)
  return recent
    .map((c, i) => {
      const h = c > 0 ? Math.max(DAY_MIN_H, Math.round((c / top) * BARS_H)) : DAY_STUB_H
      const outlier = outlierMultiple(c, avg, turns ?? recent.length) !== null
      const fill = c <= 0 ? EMPTY : outlier ? DANGER : i === recent.length - 1 ? ORANGE : MUTED
      return `<rect x="${x + i * (bw + DAY_GAP)}" y="${base - h}" width="${bw}" height="${h}" rx="1" fill="${fill}"/>`
    })
    .join('')
}

// BY MODEL: the biggest share as the figure, a split bar of all shares and each model's cost as the caption.
export const modelsZone = (k: Kit, x: number, y: number, w: number, modelCosts: [string, number][]): string => {
  const { capSize, esc, famName, mdash, mhead } = k
  const models = modelCosts
  const spentBy = models.reduce((a, [, c]) => a + c, 0)
  if (models.length === 0 || spentBy <= 0) return mdash(x, y, w, 'BY MODEL')
  const size = capSize(w)
  const [topId, topCost] = models[0]
  const fig =
    `<text x="${x}" y="${y + FIG_DY}" font-weight="600" fill="${TEXT}"><tspan font-size="${FIG_SIZE}">${famName(topId)}</tspan>` +
    `<tspan font-size="${FIG_SIZE}" fill="${MODEL_COLOR[topId] ?? TEXT}" dx="${FIG_PCT_DX}">${Math.round((topCost / spentBy) * 100)}%</tspan></text>`
  // The split bar: 6 px tall, 2 px between the parts, as wide as the column.
  const gap = 2
  const room = w - gap * (models.length - 1)
  let ws = models.map(([, c]) => Math.max(3, (c / spentBy) * room))
  const sum = ws.reduce((a, b) => a + b, 0)
  if (sum > room) ws = ws.map(s => (s * room) / sum)
  let bx = x
  let bar = ''
  models.forEach(([id], i) => {
    bar += `<rect x="${Math.round(bx * 100) / 100}" y="${y + SPLIT_BAR_DY}" width="${Math.round(ws[i] * 100) / 100}" height="${SPLIT_BAR_H}" rx="${SPLIT_BAR_H / 2}" fill="${MODEL_COLOR[id] ?? MUTED}"/>`
    bx += ws[i] + gap
  })
  // The first entry is the figure's model, so only its cost; entries are cut from the back until the line fits.
  let list = models.map(([id, c], i) => ({ id, text: i === 0 ? usd(c) : `${famName(id)} ${usd(c)}` }))
  const len = (l: typeof list) => l.map(e => `■ ${e.text}`).join(' · ').length
  while (list.length > 1 && len(list) * size * 0.56 > w) list = list.slice(0, -1)
  const cap =
    `<text x="${x}" y="${y + CAP_DY}" font-size="${size}" font-weight="500" fill="${MUTED}">` +
    list.map((e, i) => `${i ? ' · ' : ''}<tspan fill="${MODEL_COLOR[e.id] ?? MUTED}">■</tspan> ${esc(e.text)}`).join('') +
    '</text>'
  return mhead(x, y, 'BY MODEL') + fig + bar + cap
}
