import { cardSvg } from '../hooks/band/card'
import { kitOf } from '../hooks/band/look'
import { modelsZone } from '../hooks/cost/spend/card'
import type { PaceRow } from '../hooks/capacity/usage/art'
import type { CacheView } from '../hooks/cost/cache/facts'
import type { Metrics } from '../hooks/band/card-metrics'

// Shared setup for the card-*.test.ts files: the cache views, the figures, the drawing helpers and the per-tab shorthands.

export const WARM: CacheView = { mode: 'warm', idle: '18m', idleMin: 18, tokens: 240000, window: 1000000, mine: 'opus' }
export const COLD: CacheView = { mode: 'cold', idle: '2h 5m', idleMin: 125, tokens: 240000, window: 1000000, mine: 'opus' }
export const SPEND = { main: 7.4, subs: 0.37 }
// One card, from one column to four: the widths are 300 (n = 1), 800 (2), 1100 (3) and 1400 (4).
export const WIDTHS = [300, 800, 1100, 1400]
export const DELEG = { saved: 3.1, costRatio: 0.4, workMs: 12 * 60000, wallMs: 5 * 60000 }
export const METRICS: Metrics = {
  hit: 0.963, perM: 0.62, avg: 0.38, last: 2.11, multiple: 6, runway: 40.4, growth: 6200,
  models: [['opus', 14.2], ['sonnet', 5.1], ['haiku', 1.09]], deleg: DELEG, subs: 5.14, top: [['Explore', 3.9], ['coder', 1.24]],
  tools: [['Bash', 18000], ['Read', 12000], ['Grep', 6000]], toolTok: 41000, rereads: 4, rereadTok: 9000, ctxFirst: 18000, rereadFiles: [['card.ts', 2], ['record.ts', 1]],
}
/** The pace strip's height, where the columns start; a zone's title is 24 px below. */
export const YC = 88
/** The columns' rows are 124 px; a block of k status lines is 27 k + 4. */
export const ROW = 124
/** A column's width at a card width, and the x of column i. */
export const colWOf = (w: number, n: number) => Math.floor((w - 26 - (n - 1) * 26) / n)
export const colXOf = (w: number, n: number, i: number) => 13 + i * (colWOf(w, n) + 26)

// Drawings put their words between tags; look after the font data in the style block.
export const body = (s: string) => s.slice(s.indexOf('</style>'))
export const plainText = (s: string) => s.replace(/<[^>]*>/g, '')

export const H5 = 5 * 3600_000
export const PACE_OK: PaceRow = { label: '7D', color: '#ff6b1a', untilResetMs: 3 * 3600_000, windowMs: H5, used: 31, pace: { lastsMs: 5 * 3600_000, untilResetMs: 3 * 3600_000, ok: true, atReset: 78 } }
export const PACE_LOW: PaceRow = { label: '5H', color: '#f5a623', untilResetMs: 3 * 3600_000, windowMs: H5, used: 70, pace: { lastsMs: 160 * 60_000, untilResetMs: 200 * 60_000, ok: false, atReset: 175 } }
export const PACE_NONE: PaceRow = { label: '5H', color: '#f5a623', untilResetMs: null, windowMs: H5, used: 0, pace: null }

// The x of a title in the columns' row.
export const titleX = (s: string, title: string) => Number(new RegExp(`<text x="([0-9.]+)" y="${YC + 24}"[^>]*>${title}<`).exec(s)![1])
export const hasTitle = (s: string, title: string) => new RegExp(`<text x="[0-9.]+" y="${YC + 24}"[^>]*>${title}<`).test(s)
/** The colours of the status dots, top to bottom (the dot grids are r=3). */
export const dotsOf = (s: string) => (s.match(/<circle [^>]*r="4" fill="[^"]+"/g) ?? []).map(d => /fill="([^"]+)"/.exec(d)![1])

export const WITH_DAYS = { ...SPEND, days: [0, 1, 2, 0, 4, 1, 3] }

export const TAB_IDS = ['cost', 'capacity'] as const
export const TAB_LABEL = { cost: 'Cost', capacity: 'Capacity' } as const
export const cap = (w: number, m: Metrics | null = METRICS, v: CacheView = WARM, sp = SPEND) => cardSvg(v, w, sp, [PACE_OK], m, 'capacity')
export const cost = (w: number, m: Metrics | null = METRICS, v: CacheView = WARM, sp = SPEND) => cardSvg(v, w, sp, [PACE_OK], m, 'cost')
/** The drawing from a zone's title on. */
export const after = (s: string, title: string) => s.slice(s.indexOf(`>${title}<`) - 40)
/** The x of a title that sits at baseline y. */
export const titleAt = (s: string, title: string, y: number) => Number(new RegExp(`<text x="([0-9.]+)" y="${y}"[^>]*>${title}<`).exec(s)![1])
export const titleOf = (s: string, title: string) => Number(new RegExp(`<text x="([0-9.]+)" y="[0-9.]+"[^>]*>${title}<`).exec(s)![1])
export const NONE: Metrics = { hit: null, perM: null, avg: null, last: null, multiple: null, runway: null, growth: null, models: [], deleg: null, subs: 0, top: [], tools: [], toolTok: 0, rereads: 0, rereadTok: 0, ctxFirst: null, rereadFiles: [] }
export const COST_TITLES = ['CACHE DISCOUNT', 'PER MESSAGE', 'BY MODEL']
/** The BY MODEL zone as drawn in the third of three columns of a card W px wide. Cost's tab never gets a column wide enough for it (the card draws four columns at most), so its drawing is tested on its own. */
export const byModel = (W: number, models: [string, number][]) => modelsZone(kitOf(W, 'warm'), colXOf(W, 3, 2), 0, colWOf(W, 3), models)
