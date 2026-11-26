import { BAR_H } from '../art'
import { EMPTY, ORANGE, TEXT } from '../../../band/look'
import type { Progress } from '../../../../types'
import { CY, FONT, anim, doc, nodesOf, num, stateOf, text } from './kit'

// ---------- Heartbeat ----------

/** The ECG's height in tenths of its full size: its tallest spike stays 8 px below the top of the drawing. */
const ECG_M = 6.5
const ECGW = 29
/** Room before a step's name (px) and the fewest px between nodes. */
const NAME_OFF = 14
const NODE_MIN_SP = 10
/** One ECG complex as relative path commands: P wave, Q dip, R spike, S, T hump. `m` tenths of height, `sx` of width. */
const ecg = (m: number, sx: number): string => {
  const s = (v: number) => num((v * m) / 10)
  const x = (v: number) => num(v * sx)
  return `q${x(3)} ${s(-4)} ${x(6)} 0 l${x(2)} ${s(2)} l${x(3)} ${s(-18)} l${x(4)} ${s(24)} l${x(3)} ${s(-8)} l${x(3)} 0 q${x(4)} ${s(-6)} ${x(8)} 0`
}
/** A line from `a` to `b` with a complex every `ev` px (narrowed when `ev` is tight). */
const trace = (a: number, b: number, ev: number, m: number): string => {
  let d = `M${num(a)} ${CY}`
  if (ev >= 3) {
    const sx = Math.min(1, Math.max(0.3, (ev - 2) / ECGW))
    const w = ECGW * sx
    for (let p = a + ev / 2 - w / 2; p + w <= b + 0.01; p += ev) d += ` L${num(p)} ${CY} ${ecg(m, sx)}`
  }
  return `${d} L${num(b)} ${CY}`
}
/** The monitor: a pen writes the trace from `a` to `b` again and again, the screen erased a little ahead of it. */
const pen = (a: number, b: number, ev: number, dur: string): string => {
  const L = b - a
  if (L < 16) return ''
  const d = trace(a, b, ev, ECG_M)
  return (
    `<clipPath id="pw"><rect x="${num(a)}" y="0" width="0" height="${BAR_H}">${anim('width', `0;${num(L)}`, dur)}</rect></clipPath>` +
    `<clipPath id="pe"><rect x="${num(a + 14)}" y="0" width="${num(Math.max(1, L - 14))}" height="${BAR_H}">${anim('x', `${num(a + 14)};${num(b)}`, dur)}${anim('width', `${num(Math.max(1, L - 14))};0`, dur)}</rect></clipPath>` +
    `<path d="${d}" fill="none" stroke="${ORANGE}" stroke-width="1.6" opacity=".35" clip-path="url(#pe)"/>` +
    `<path d="${d}" fill="none" stroke="${ORANGE}" stroke-width="2.2" stroke-linejoin="round" clip-path="url(#pw)"/>` +
    `<circle cx="${num(a)}" cy="${CY}" r="7" fill="${ORANGE}" opacity=".25">${anim('cx', `${num(a)};${num(b)}`, dur)}</circle>` +
    `<circle cx="${num(a)}" cy="${CY}" r="3.5" fill="${ORANGE}">${anim('cx', `${num(a)};${num(b)}`, dur)}</circle>`
  )
}
const HEART = 'M0 3 C-6 -1 -6 -7 -2.5 -7 C-1 -7 0 -5.5 0 -4.5 C0 -5.5 1 -7 2.5 -7 C6 -7 6 -1 0 3 Z'
/** The heart, beating lub-dub when `beats`. */
const heart = (cx: number, beats: boolean): string =>
  `<g transform="translate(${num(cx)} ${CY})"><g>` +
  (beats ? '<animateTransform attributeName="transform" type="scale" values="1;1.35;1;1.2;1;1" keyTimes="0;.1;.2;.3;.42;1" dur="1s" repeatCount="indefinite"/>' : '') +
  `<path d="${HEART}" fill="${ORANGE}" transform="scale(1.3) translate(0 2)"/></g></g>`

const dotted = (x1: number, x2: number): string =>
  x2 - x1 > 0.5 ? `<line x1="${num(x1)}" y1="${CY}" x2="${num(x2)}" y2="${CY}" stroke="${EMPTY}" stroke-width="2" stroke-dasharray="2 5"/>` : ''

export const vitalsWalk = (p: Progress, W: number): string => {
  const { n, d, fin, isCur } = stateOf(p)
  const trail = (to: number): string =>
    to > 4 && d > 0 ? `<path d="${trace(0, to, to / d, ECG_M)}" fill="none" stroke="${ORANGE}" stroke-width="2.2" stroke-linejoin="round"/>` : ''
  if (fin) return doc(W, trail(W - 16) + heart(W - 9, false))
  const g = nodesOf(p, W, NAME_OFF, NODE_MIN_SP)
  const hx = g.at(Math.min(d, n - 1))
  let body = ''
  if (isCur) {
    body += d > 0 ? pen(0, hx - 14, (hx - 14) / d, '2.4s') : ''
    body += heart(hx, true)
    if (g.label) body += text(hx + NAME_OFF, FONT, 700, TEXT, g.label)
  } else {
    body += trail(hx)
  }
  const from = isCur ? hx + g.L : hx
  body += dotted(from + 8, W)
  for (let i = isCur ? d + 1 : d; i < g.hi; i++) body += `<circle cx="${num(g.at(i))}" cy="${CY}" r="3" fill="${EMPTY}"/>`
  return doc(W, body)
}
export const vitalsPace = (W: number): string => doc(W, heart(10, true) + pen(24, W, 90, '3.6s'))
