// The spend slice's zones of the card: SPEND, DELEGATION, PER MESSAGE and BY MODEL. Pure: each returns an SVG
// string the band places.

import { DANGER, EMPTY, FABLE, HUE, MUTED, OK, ORANGE, TEXT, YELLOW } from '../../band/look'
import type { Kit } from '../../band/look'
import { fmtIdle } from '../cache/facts'
import { usd } from '../prices'
import type { Delegation } from './metrics'
import { resultsText } from './results'

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
  const gap = 4
  const bw = 12
  const top = Math.max(...days)
  return days
    .map((d, i) => {
      const h = d > 0 ? Math.max(3, Math.round((d / top) * maxH)) : 2
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
  const g = t(x, y + 24, 'SPEND', { size: 14, ls: 1.4 })
  const fig = `≈${usd(total)}`
  const split = (n: number) => {
    // The subagents' share, at least one dot once they have cost anything.
    const subDots = total <= 0 || subsCost <= 0 ? 0 : Math.min(n - 1, Math.max(1, Math.round((subsCost / total) * n)))
    return (i: number) => (total <= 0 ? EMPTY : i < n - subDots ? HUEM : MUTED)
  }
  const cols = Math.max(10, Math.min(25, Math.floor(w / 9.6)))
  // With the results line the figure, chart and first caption move up, as in IN CACHE with its runway line.
  if (resultCaptions.length) {
    const chart = days ? dayBars(days, x, y + 80, 12) : dots(x, y + 68, cols, 9.6, 2, split(cols * 2))
    return (
      g +
      big(x, y + 60, fig, 38, 'this thread', 15) +
      chart +
      (caption ? t(x, y + 98, caption, { size: capSize(w), w: 500 }) : '') +
      t(x, y + 118, esc(capPick(resultCaptions, w, capSize(w))), { size: capSize(w), w: 500 })
    )
  }
  const chart = days ? dayBars(days, x, y + 90, 20) : dots(x, y + 80, cols, 9.6, 2, split(cols * 2))
  return g + big(x, y + 62, fig, 38, 'this thread', 15) + chart + (caption ? t(x, y + 108, caption, { size: capSize(w), w: 500 }) : '')
}

// DELEGATION: what subagents saved, two compare rows (cost and time against doing it all on the main model, one
// after another) beside the figure, and the work done against the time it took. While the figure is unknown it
// shows a dash and says when it will not be.
export const delegZone = (k: Kit, x: number, y: number, w: number, metrics: { deleg: Delegation | null; subs: number } | null): string => {
  const { t, big, capPick, capSize, esc } = k
  const g = t(x, y + 24, 'DELEGATION', { size: 14, ls: 1.4 })
  const cap = capSize(w)
  const words = (s: string) => t(x, y + 108, esc(s), { size: cap, w: 500 })
  const dash = big(x, y + 62, '—', 38, '', 15)
  if (!metrics) return g + dash + words('after a few turns')
  const d = metrics.deleg
  if (!d) return g + dash + words(capPick(metrics.subs > 0 ? ['tracked from the next subagent', 'tracked from next subagent'] : ['no subagents this thread'], w, cap))
  const figure = `≈${usd(d.saved)}`
  const figW = figure.length * 38 * 0.6 + 7 + 'saved'.length * 15 * 0.56
  const rx = x + Math.max(Math.round(figW) + 16, Math.round(w / 2))
  const tx = rx + 40
  const tw = x + w - tx
  let rows = ''
  if (tw >= 30) {
    const compare = (ty: number, label: string, ratio: number | null, fill: string) => {
      const fw = ratio === null ? 0 : Math.min(tw, Math.max(ratio > 0 ? 3 : 0, Math.round(ratio * tw)))
      return (
        t(rx, ty + 6, label, { size: 14, w: 600 }) +
        `<rect x="${tx}" y="${ty}" width="${tw}" height="6" rx="3" fill="${EMPTY}"/>` +
        (fw > 0 ? `<rect x="${tx}" y="${ty}" width="${fw}" height="6" rx="3" fill="${fill}"/>` : '')
      )
    }
    rows = compare(y + 40, 'cost', d.costRatio, ORANGE) + compare(y + 56, 'time', d.workMs > 0 && d.wallMs > 0 ? Math.min(1, d.wallMs / d.workMs) : null, YELLOW)
  }
  const speed = d.workMs > 0 && d.wallMs > 0 ? (d.workMs / d.wallMs).toFixed(1) : null
  const variants =
    speed === null
      ? ['run time not recorded']
      : [
          `${fmtSpan(d.workMs)} of agent work in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
          `${fmtSpan(d.workMs)} work in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
          `${fmtSpan(d.workMs)} in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
        ]
  return g + big(x, y + 62, figure, 38, 'saved', 15, OK) + rows + words(capPick(variants, w, cap))
}

// PER MESSAGE: the average cost of a message; the last one is the caption, flagged in the danger colour when it is far above the average.
export const avgZone = (k: Kit, x: number, y: number, w: number, metrics: { avg: number | null; last: number | null; multiple: number | null } | null): string => {
  const { big, capSize, mdash, mhead } = k
  if (!metrics || metrics.avg === null) return mdash(x, y, w, 'PER MESSAGE')
  const last =
    metrics.last === null
      ? ''
      : `<text x="${x}" y="${y + 108}" font-size="${capSize(w)}" font-weight="500" fill="${MUTED}">last ${usd(metrics.last)}` +
        (metrics.multiple !== null ? `<tspan fill="${DANGER}" font-weight="700"> · ${metrics.multiple}× avg</tspan>` : '') +
        '</text>'
  return mhead(x, y, 'PER MESSAGE') + big(x, y + 62, usd(metrics.avg), 38, 'avg', 15) + last
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
    `<text x="${x}" y="${y + 62}" font-weight="600" fill="${TEXT}"><tspan font-size="38">${famName(topId)}</tspan>` +
    `<tspan font-size="38" fill="${MODEL_COLOR[topId] ?? TEXT}" dx="10">${Math.round((topCost / spentBy) * 100)}%</tspan></text>`
  // The split bar: 6 px tall, 2 px between the parts, as wide as the column.
  const gap = 2
  const room = w - gap * (models.length - 1)
  let ws = models.map(([, c]) => Math.max(3, (c / spentBy) * room))
  const sum = ws.reduce((a, b) => a + b, 0)
  if (sum > room) ws = ws.map(s => (s * room) / sum)
  let bx = x
  let bar = ''
  models.forEach(([id], i) => {
    bar += `<rect x="${Math.round(bx * 100) / 100}" y="${y + 78}" width="${Math.round(ws[i] * 100) / 100}" height="6" rx="3" fill="${MODEL_COLOR[id] ?? MUTED}"/>`
    bx += ws[i] + gap
  })
  // The first entry is the figure's model, so only its cost; entries are cut from the back until the line fits.
  let list = models.map(([id, c], i) => ({ id, text: i === 0 ? usd(c) : `${famName(id)} ${usd(c)}` }))
  const len = (l: typeof list) => l.map(e => `■ ${e.text}`).join(' · ').length
  while (list.length > 1 && len(list) * size * 0.56 > w) list = list.slice(0, -1)
  const cap =
    `<text x="${x}" y="${y + 108}" font-size="${size}" font-weight="500" fill="${MUTED}">` +
    list.map((e, i) => `${i ? ' · ' : ''}<tspan fill="${MODEL_COLOR[e.id] ?? MUTED}">■</tspan> ${esc(e.text)}`).join('') +
    '</text>'
  return mhead(x, y, 'BY MODEL') + fig + bar + cap
}
