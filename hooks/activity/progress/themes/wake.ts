import { EMPTY, MUTED, ORANGE, TEXT } from '../../../band/look'
import type { Progress } from '../../../../types'
import { CHAR, CY, FONT, anim, cut, doc, esc, nameAt, num, stateOf, textPx } from './kit'

const PULSE = '<animate attributeName="opacity" values="1;.3;1" dur="1.4s" repeatCount="indefinite"/>'

// ---------- Wave + breadcrumbs ----------

/** A wave from x0 to x1 at y: amplitude `a`, half a wavelength `h`; moving it `2h` sideways repeats it. */
const wavePath = (x0: number, y: number, x1: number, a: number, h: number): string => {
  let d = `M${num(x0)} ${num(y)} q${num(h / 2)} -${a} ${h} 0`
  for (let x = x0 + h; x < x1; x += h) d += ` t${h} 0`
  return d
}
const WAVE_Y = CY + 8
const SEP = 18
export const wakeWalk = (p: Progress, W: number): string => {
  const { n, d, fin, isCur } = stateOf(p)
  const known = p.steps.length > 0
  const focus = Math.min(d, n - 1)
  const lead = (s: string): string => (isCur && s === 'cur' ? '● ' : s === 'done' ? '✓ ' : '')
  type Crumb = { kind: 'done' | 'cur' | 'ahead'; s: string; w: number }
  const kindOf = (i: number): Crumb['kind'] => (i < d ? 'done' : isCur && i === d ? 'cur' : 'ahead')
  const crumbOf = (i: number, max: number): Crumb => {
    const kind = kindOf(i)
    const raw = nameAt(p, i, d, isCur) || (known ? `Step ${i + 1}` : '')
    const s = lead(kind) + cut(raw, Math.max(0, max - 2 * FONT * CHAR) , FONT)
    return { kind, s, w: textPx(s, FONT) }
  }
  let crumbs: Crumb[] = []
  let lo = 0
  let hi = 0
  if (known) {
    const all = Array.from({ length: n }, (_, i) => crumbOf(i, 18 * FONT * CHAR))
    const total = all.reduce((s, c) => s + c.w + SEP, 0) - SEP
    const budget = total <= W ? W : W - 44
    all[focus] = crumbOf(focus, Math.max(60, budget - 2 * FONT * CHAR))
    lo = focus
    hi = focus + 1
    let sum = all[focus].w
    for (;;) {
      let grew = false
      if (lo > 0 && sum + SEP + all[lo - 1].w <= budget) { sum += SEP + all[--lo].w; grew = true }
      if (hi < n && sum + SEP + all[hi].w <= budget) { sum += SEP + all[hi++].w; grew = true }
      if (!grew) break
    }
    crumbs = all.slice(lo, hi)
  } else if (isCur && p.note) {
    const c = crumbOf(d, W - 24)
    crumbs = [c]
    hi = 1
  }
  const base = CY - 1
  const mute = (x: number, s: string): string => `<text x="${num(x)}" y="${base}" font-size="${FONT}" font-weight="500" fill="${MUTED}">${esc(s)}</text>`
  if (!crumbs.length) {
    // Nothing to name: the wave and the dotted line share the width by what is done.
    const to = Math.round((W * (fin ? n : d)) / n)
    return doc(W, waveBand(0, to, fin || !isCur) + (to < W - 6 ? dottedAt(to + 6, W) : ''))
  }
  let body = ''
  let x = 0
  if (lo > 0) { body += mute(x, '… ›'); x += 26 }
  let curStart = x
  let curEnd = x
  for (let k = 0; k < crumbs.length; k++) {
    const c = crumbs[k]
    if (c.kind === 'cur') {
      curStart = x
      body += `<text x="${num(x)}" y="${base}" font-size="${FONT}" font-weight="700" fill="${TEXT}"><tspan fill="${ORANGE}">●${PULSE}</tspan>${esc(c.s.slice(1))}</text>`
      curEnd = x + c.w
    } else {
      body += mute(x, c.s)
    }
    x += c.w
    if (k < crumbs.length - 1) { body += mute(x + 5, '›'); x += SEP }
  }
  if (hi < n && known) { body += mute(x + 5, '›'); body += mute(x + SEP, '…'); x += SEP + 10 }
  const doneEnd = isCur ? curStart - 6 : x
  body += waveBand(0, doneEnd, !isCur)
  if (isCur) {
    body += waveBox('wc', curStart, curEnd, 14, WAVE_Y, 3, 2.4, '0.5s', 1)
    body += dottedAt(curEnd + 6, x)
  }
  return doc(W, body)
}
const dottedAt = (x1: number, x2: number): string =>
  x2 - x1 > 0.5 ? `<line x1="${num(x1)}" y1="${WAVE_Y}" x2="${num(x2)}" y2="${WAVE_Y}" stroke="${EMPTY}" stroke-width="2" stroke-dasharray="2 4"/>` : ''
/** A wave inside a box from `a` to `b`, drifting sideways unless `still`. */
const waveBox = (id: string, a: number, b: number, h: number, y: number, amp: number, sw: number, dur: string, op: number, still = false): string =>
  b - a < 1
    ? ''
    : `<clipPath id="${id}"><rect x="${num(a)}" y="${num(y - h / 2)}" width="${num(b - a)}" height="${h}"/></clipPath>` +
      `<g clip-path="url(#${id})"><path d="${wavePath(a - 12, y, b + 12, amp, 6)}" fill="none" stroke="${ORANGE}" stroke-width="${sw}" opacity="${op}">` +
      (still ? '' : `<animateTransform attributeName="transform" type="translate" values="-12 0;0 0" dur="${dur}" repeatCount="indefinite"/>`) +
      '</path></g>'
/** The calm wave under the done part `a` to `b`, still when there is nothing under way. */
const waveBand = (a: number, b: number, still: boolean): string => waveBox('wd', a, b, 11, WAVE_Y, 1, 1.6, '1.2s', 0.7, still)
export const wakePace = (W: number): string => {
  const d = wavePath(0, CY, W, 2, 6)
  const w = Math.min(120, Math.round(W / 2))
  return doc(
    W,
    `<path d="${d}" fill="none" stroke="${EMPTY}" stroke-width="1.6"/>` +
      `<clipPath id="wi"><rect x="0" y="${CY - 7}" width="${w}" height="14">${anim('x', `0;${num(W - w)};0`, '3s')}</rect></clipPath>` +
      `<g clip-path="url(#wi)"><path d="${d}" fill="none" stroke="${ORANGE}" stroke-width="2.2"/></g>`,
  )
}
