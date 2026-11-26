import { BAR_CY, BAR_H } from '../art'
import { svgDoc } from '../../../band/look'
import type { Progress } from '../../../../types'

// What the themes share: the drawing helpers, the figures they measure text by, and the nodes on a line.

export type Theme = {
  walk: (p: Progress, W: number) => string
  pace: (W: number, info: string) => string
  /** The drawing names the current step itself, so the words after the bar leave the note out. */
  names: boolean
  /** The idle drawing carries the pulse line (`4 STEPS · 1M 12S`), so the words after the bar leave it out. */
  info: boolean
}

export const CY = BAR_CY
export const CHAR = 0.6
export const FONT = 12

export const num = (v: number): string => String(Math.round(v * 100) / 100)
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const textPx = (s: string, size: number, k = CHAR): number => s.length * size * k
/** `s` cut with … to fit `px`; '' when not even two characters fit. */
export const cut = (s: string, px: number, size: number, k = CHAR): string => {
  const max = Math.floor(px / (size * k) + 1e-6)
  return s.length <= max ? s : max >= 2 ? s.slice(0, max - 1) + '…' : ''
}
export const text = (x: number, size: number, weight: number, fill: string, s: string, anchor?: 'end', dy = 4): string =>
  `<text x="${num(x)}" y="${CY + dy}" font-size="${size}" font-weight="${weight}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`
/** The shortest line bar() draws (px). */
const BAR_MIN_W = 0.5
export const bar = (x1: number, x2: number, fill: string): string =>
  x2 - x1 > BAR_MIN_W ? `<rect x="${num(x1)}" y="${CY - 1}" width="${num(x2 - x1)}" height="2" rx="1" fill="${fill}"/>` : ''
export const anim = (attr: string, values: string, dur: string, extra = ''): string =>
  `<animate attributeName="${attr}" values="${values}"${extra ? ' ' + extra : ''} dur="${dur}" repeatCount="indefinite"/>`
export const doc = (W: number, body: string): string => svgDoc(W, BAR_H, body, body.includes('<text'))

/** What a request with a list looks like to a drawing: `n` steps, `d` done, the next one under way when `isCur`. */
export const stateOf = (p: Progress): { n: number; d: number; isCur: boolean; fin: boolean } => {
  const n = Math.max(1, p.total)
  const fin = p.isFinished
  const d = fin ? n : Math.max(0, Math.min(n, p.done))
  return { n, d, fin, isCur: !fin && p.hasCurrent && d < n }
}
/** Step `i`'s name: the current step's is the note; the others come from the list, when there is one. */
export const nameAt = (p: Progress, i: number, d: number, isCur: boolean): string =>
  i === d && isCur ? p.note : (p.steps[i]?.title ?? '')

/** A run of at most `max` of `n` things that holds `focus`. */
const windowOf = (n: number, focus: number, max: number): [number, number] => {
  if (n <= max) return [0, n]
  const lo = Math.max(0, Math.min(n - max, focus - Math.floor(max / 2)))
  return [lo, lo + max]
}

// ---------- Nodes on a line (heartbeat, pie, comet) ----------

/** Nodes: the first one's x (px), the room kept at the right edge (px), the share of the width a step's name may take, and the gap before the name (px). */
const NODE_START = 8
const NODE_END_PAD = 16
const NAME_SHARE = 0.4
const NAME_GAP = 4

type Nodes = { lo: number; hi: number; label: string; L: number; at: (i: number) => number }
/**
 * Where the nodes of steps lo..hi-1 sit across `W` pixels, spaced evenly with room after the current one for
 * its name (`label`, `L` px wide with its gap). Too many steps for `minSp` px each show a window around the current.
 */
export const nodesOf = (p: Progress, W: number, off: number, minSp: number): Nodes => {
  const { n, d, isCur } = stateOf(p)
  const label = isCur ? cut(nameAt(p, d, d, true), W * NAME_SHARE, FONT) : ''
  const L = label ? off + textPx(label, FONT) + NAME_GAP : 0
  const room = Math.max(0, W - NODE_END_PAD - L)
  const [lo, hi] = windowOf(n, Math.min(d, n - 1), Math.max(2, Math.floor(room / minSp) + 1))
  const sp = hi - lo > 1 ? room / (hi - lo - 1) : 0
  return { lo, hi, label, L, at: i => NODE_START + (i - lo) * sp + (isCur && i > d ? L : 0) }
}
