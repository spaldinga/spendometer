import { EMPTY, LC_BL, LC_INK, LC_LA, LC_OR, LC_PE, LC_TA, MUTED, ORANGE, TEXT, svgDoc } from './cache-art'
import { BAR_CY, BAR_H, paceSvg, walkSvg } from './progress-art'
import type { Progress } from '../types'

// The progress row's themes. Each is a pair of pure functions: `walk` draws a request with a step list
// (or a report) at `W` pixels, `pace` draws a request that is working with no list. Colours are only the
// band's own constants and the console's, so svgDoc's light style covers every drawing. Text is
// measured by estimate (0.6 em a character, 0.7 for bold capitals), as cache-art.ts does; the step names
// are cut with … to what the width leaves. A colour that changes in an animation would escape the light
// style (it swaps attributes, not animated values), so a changing colour is two shapes and an
// animated opacity.

export type Theme = {
  walk: (p: Progress, W: number) => string
  pace: (W: number, info: string) => string
  /** The drawing names the current step itself, so the words after the bar leave the note out. */
  names: boolean
  /** The idle drawing carries the pulse line (`4 STEPS · 1M 12S`), so the words after the bar leave it out. */
  info: boolean
}

const CY = BAR_CY
const CHAR = 0.6
const CAPS = 0.7
const FONT = 12
const SMALL = 11

const num = (v: number): string => String(Math.round(v * 100) / 100)
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textPx = (s: string, size: number, k = CHAR): number => s.length * size * k
/** `s` cut with … to fit `px`; '' when not even two characters fit. */
const cut = (s: string, px: number, size: number, k = CHAR): string => {
  const max = Math.floor(px / (size * k) + 1e-6)
  return s.length <= max ? s : max >= 2 ? s.slice(0, max - 1) + '…' : ''
}
const text = (x: number, size: number, weight: number, fill: string, s: string, anchor?: 'end', dy = 4): string =>
  `<text x="${num(x)}" y="${CY + dy}" font-size="${size}" font-weight="${weight}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`
const bar = (x1: number, x2: number, fill: string): string =>
  x2 - x1 > 0.5 ? `<rect x="${num(x1)}" y="${CY - 1}" width="${num(x2 - x1)}" height="2" rx="1" fill="${fill}"/>` : ''
const dotted = (x1: number, x2: number): string =>
  x2 - x1 > 0.5 ? `<line x1="${num(x1)}" y1="${CY}" x2="${num(x2)}" y2="${CY}" stroke="${EMPTY}" stroke-width="2" stroke-dasharray="2 5"/>` : ''
const anim = (attr: string, values: string, dur: string, extra = ''): string =>
  `<animate attributeName="${attr}" values="${values}"${extra ? ' ' + extra : ''} dur="${dur}" repeatCount="indefinite"/>`
const PULSE = '<animate attributeName="opacity" values="1;.3;1" dur="1.4s" repeatCount="indefinite"/>'
const doc = (W: number, body: string): string => svgDoc(W, BAR_H, body, body.includes('<text'))

/** What a request with a list looks like to a drawing: `n` steps, `d` done, the next one under way when `isCur`. */
const stateOf = (p: Progress): { n: number; d: number; isCur: boolean; fin: boolean } => {
  const n = Math.max(1, p.total)
  const fin = p.isFinished
  const d = fin ? n : Math.max(0, Math.min(n, p.done))
  return { n, d, fin, isCur: !fin && p.hasCurrent && d < n }
}
/** Step `i`'s name: the current step's is the note; the others come from the list, when there is one. */
const nameAt = (p: Progress, i: number, d: number, isCur: boolean): string =>
  i === d && isCur ? p.note : (p.steps[i]?.title ?? '')

/** A run of at most `max` of `n` things that holds `focus`. */
const windowOf = (n: number, focus: number, max: number): [number, number] => {
  if (n <= max) return [0, n]
  const lo = Math.max(0, Math.min(n - max, focus - Math.floor(max / 2)))
  return [lo, lo + max]
}

// ---------- Nodes on a line (heartbeat, pie, comet) ----------

type Nodes = { lo: number; hi: number; label: string; L: number; at: (i: number) => number }
/**
 * Where the nodes of steps lo..hi-1 sit across `W` pixels, spaced evenly with room after the current one for
 * its name (`label`, `L` px wide with its gap). Too many steps for `minSp` px each show a window around the current.
 */
const nodesOf = (p: Progress, W: number, off: number, minSp: number): Nodes => {
  const { n, d, isCur } = stateOf(p)
  const label = isCur ? cut(nameAt(p, d, d, true), W * 0.4, FONT) : ''
  const L = label ? off + textPx(label, FONT) + 4 : 0
  const room = Math.max(0, W - 16 - L)
  const [lo, hi] = windowOf(n, Math.min(d, n - 1), Math.max(2, Math.floor(room / minSp) + 1))
  const sp = hi - lo > 1 ? room / (hi - lo - 1) : 0
  return { lo, hi, label, L, at: i => 8 + (i - lo) * sp + (isCur && i > d ? L : 0) }
}

// ---------- Heartbeat ----------

/** The ECG's height in tenths of its full size: its tallest spike stays 8 px below the top of the drawing. */
const ECG_M = 6.5
const ECGW = 29
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

const heartWalk = (p: Progress, W: number): string => {
  const { n, d, fin, isCur } = stateOf(p)
  const trail = (to: number): string =>
    to > 4 && d > 0 ? `<path d="${trace(0, to, to / d, ECG_M)}" fill="none" stroke="${ORANGE}" stroke-width="2.2" stroke-linejoin="round"/>` : ''
  if (fin) return doc(W, trail(W - 16) + heart(W - 9, false))
  const g = nodesOf(p, W, 14, 10)
  const hx = g.at(Math.min(d, n - 1))
  let body = ''
  if (isCur) {
    body += d > 0 ? pen(0, hx - 14, (hx - 14) / d, '2.4s') : ''
    body += heart(hx, true)
    if (g.label) body += text(hx + 14, FONT, 700, TEXT, g.label)
  } else {
    body += trail(hx)
  }
  const from = isCur ? hx + g.L : hx
  body += dotted(from + 8, W)
  for (let i = isCur ? d + 1 : d; i < g.hi; i++) body += `<circle cx="${num(g.at(i))}" cy="${CY}" r="3" fill="${EMPTY}"/>`
  return doc(W, body)
}
const heartPace = (W: number): string => doc(W, heart(10, true) + pen(24, W, 90, '3.6s'))

// ---------- Console ----------

const BLK_H = 18
const BLK_Y = BAR_CY - BLK_H / 2
const BLK_GAP = 4
const DONE_FILLS = [LC_TA, LC_PE, LC_OR]
const pad2 = (v: number): string => String(v).padStart(2, '0')
const block = (x: number, w: number, fill: string, label: string, extra = ''): string =>
  `<rect x="${num(x)}" y="${BLK_Y}" width="${num(w)}" height="${BLK_H}" fill="${fill}"/>${extra}` +
  (label ? text(x + w - 6, SMALL, 700, LC_INK, label, 'end') : '')
const capLeft = (w: number, label: string): string =>
  `<rect x="0" y="${BLK_Y}" width="${num(w)}" height="${BLK_H}" rx="9" fill="${LC_OR}"/><rect x="${num(w - 9)}" y="${BLK_Y}" width="9" height="${BLK_H}" fill="${LC_OR}"/>` +
  text(w - 8, SMALL, 700, LC_INK, label, 'end')
const capRight = (W: number, w: number): string =>
  `<rect x="${num(W - w)}" y="${BLK_Y}" width="${num(w)}" height="${BLK_H}" rx="9" fill="${LC_LA}"/><rect x="${num(W - w)}" y="${BLK_Y}" width="9" height="${BLK_H}" fill="${LC_LA}"/>`
const CAP_R = 34
const capW = (label: string): number => Math.ceil(textPx(label, SMALL, CAPS) + 24)

/** The narrowest a step block is: its number. */
const BLK_MIN = Math.ceil(textPx('00', SMALL, CAPS) + 14)
/** The most of the room the current step may ask for its name. */
const NOW_SHARE = 0.6
/** The longest name a block asks room for; a longer one is cut to what it gets. */
const NAME_MAX = 20

const consoleWalk = (p: Progress, W: number): string => {
  const { n, d, fin, isCur } = stateOf(p)
  const full = fin ? `DONE ${pad2(n)}·${pad2(n)}` : isCur ? `STEP ${pad2(d + 1)}·${pad2(n)}` : `DONE ${pad2(d)}·${pad2(n)}`
  const label = W >= 420 ? full : full.slice(5)
  const cap = capW(label)
  const x0 = cap + BLK_GAP
  const limit = W - CAP_R - BLK_GAP
  const avail = Math.max(0, limit - x0)
  const focus = Math.min(d, n - 1)
  // Each block's room: `nat` for its whole name (the current block also carries its number), `min` at the least. A
  // block shows its number when its name does not fit at all.
  const NOW_PAD = 2 * SMALL * CAPS + 26
  const items = Array.from({ length: n }, (_, i) => {
    const isNow = isCur && i === d
    const name = nameAt(p, i, d, isCur).toUpperCase()
    const nat = isNow ? textPx(name, SMALL, CAPS) + NOW_PAD : Math.min(textPx(name, SMALL, CAPS), NAME_MAX * SMALL * CAPS) + 14
    const min = isNow ? Math.max(BLK_MIN, Math.min(nat, NOW_SHARE * avail)) : BLK_MIN
    return { i, name, isNow, nat: Math.max(nat, min), min: Math.min(min, Math.max(avail, 1)) }
  })
  // A window of blocks around the current one: behind it and ahead of it in turn, while they fit at their least.
  let lo = focus
  let hi = focus + 1
  let sum = items[focus].min
  for (;;) {
    let grew = false
    if (lo > 0 && sum + BLK_GAP + items[lo - 1].min <= avail) { sum += BLK_GAP + items[--lo].min; grew = true }
    if (hi < n && sum + BLK_GAP + items[hi].min <= avail) { sum += BLK_GAP + items[hi++].min; grew = true }
    if (!grew) break
  }
  // The blocks share the room: all of them grow in proportion to their names when it is more than the names ask
  // for, and shrink from their names towards their least when it is less. The last one ends where the end cap begins.
  const shown = items.slice(lo, hi)
  const space = avail - BLK_GAP * (shown.length - 1)
  const sumNat = shown.reduce((a, it) => a + it.nat, 0)
  const sumMin = shown.reduce((a, it) => a + it.min, 0)
  const widths = shown.map(it =>
    space >= sumNat ? (it.nat * space) / sumNat : it.min + (sumNat > sumMin ? ((space - sumMin) * (it.nat - it.min)) / (sumNat - sumMin) : 0),
  )
  let body = capLeft(cap, label)
  let x = x0
  shown.forEach((it, k) => {
    const w = widths[k]
    const t = cut(it.name, it.isNow ? w - NOW_PAD : w - 14, SMALL, CAPS)
    if (it.isNow) {
      body += block(x, w, LC_OR, t, `<rect x="${num(x)}" y="${BLK_Y}" width="${num(w)}" height="${BLK_H}" fill="${LC_LA}" opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;.5;1" calcMode="discrete" dur="1.2s" repeatCount="indefinite"/></rect>`)
      body += text(x + 6, SMALL, 700, LC_INK, pad2(it.i + 1))
    } else if (it.i < d) {
      body += block(x, w, DONE_FILLS[it.i % 3], t || pad2(it.i + 1))
    } else {
      body += `<g opacity=".5">${block(x, w, LC_BL, t || pad2(it.i + 1))}</g>`
    }
    x += w + BLK_GAP
  })
  return doc(W, body + capRight(W, CAP_R))
}
const consolePace = (W: number, info: string): string => {
  const cap = capW('WORKING')
  let body = capLeft(cap, 'WORKING')
  const limit = W - CAP_R - BLK_GAP
  let x = cap + BLK_GAP
  const text1 = info.toUpperCase()
  const w1 = textPx(text1, SMALL, CAPS) + 14
  if (text1 && x + w1 + BLK_GAP + 24 <= limit) {
    body += block(x, w1, LC_PE, text1)
    x += w1 + BLK_GAP
  }
  const BW = 22
  const k = Math.max(0, Math.min(12, Math.floor((limit - x + BLK_GAP) / (BW + BLK_GAP))))
  const cols = [LC_BL, LC_LA, LC_TA]
  if (k > 0) {
    const bw = (limit - x - (k - 1) * BLK_GAP) / k
    for (let i = 0; i < k; i++) {
      body += `<rect x="${num(x + i * (bw + BLK_GAP))}" y="${BLK_Y}" width="${num(bw)}" height="${BLK_H}" fill="${cols[i % 3]}" opacity=".25">${anim('opacity', '.25;1;.25;.25', '2s', `keyTimes="0;.1;.3;1" begin="${num(i * 0.2)}s"`)}</rect>`
    }
  }
  return doc(W, body + capRight(W, CAP_R))
}

// ---------- Wave + breadcrumbs ----------

/** A wave from x0 to x1 at y: amplitude `a`, half a wavelength `h`; moving it `2h` sideways repeats it. */
const wavePath = (x0: number, y: number, x1: number, a: number, h: number): string => {
  let d = `M${num(x0)} ${num(y)} q${num(h / 2)} -${a} ${h} 0`
  for (let x = x0 + h; x < x1; x += h) d += ` t${h} 0`
  return d
}
const WAVE_Y = CY + 8
const SEP = 18
const waveWalk = (p: Progress, W: number): string => {
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
const wavePace = (W: number): string => {
  const d = wavePath(0, CY, W, 2, 6)
  const w = Math.min(120, Math.round(W / 2))
  return doc(
    W,
    `<path d="${d}" fill="none" stroke="${EMPTY}" stroke-width="1.6"/>` +
      `<clipPath id="wi"><rect x="0" y="${CY - 7}" width="${w}" height="14">${anim('x', `0;${num(W - w)};0`, '3s')}</rect></clipPath>` +
      `<g clip-path="url(#wi)"><path d="${d}" fill="none" stroke="${ORANGE}" stroke-width="2.2"/></g>`,
  )
}

// ---------- Pie ----------

const PIE_R = 7.5
const IDLE_SP = 52
const PIE_FULL = 17.3
/** A node: a ring with a disc (done), a clock sweeping (current), nothing (ahead); `idle` fills and clears on a timer. */
const pie = (cx: number, state: 'done' | 'cur' | 'todo' | 'idle', at = 0): string => {
  const ring = `<circle cx="${num(cx)}" cy="${CY}" r="${PIE_R}" fill="none" stroke="${state === 'done' || state === 'cur' ? ORANGE : EMPTY}" stroke-width="1.5"/>`
  if (state === 'done') return ring + `<circle cx="${num(cx)}" cy="${CY}" r="5.5" fill="${ORANGE}"/>`
  if (state === 'todo') return ring
  const sweep = (a: string) =>
    `<circle cx="${num(cx)}" cy="${CY}" r="2.75" fill="none" stroke="${ORANGE}" stroke-width="5.5" stroke-dasharray="0 ${PIE_FULL}" transform="rotate(-90 ${num(cx)} ${CY})">${a}</circle>`
  if (state === 'cur') return ring + sweep(anim('stroke-dasharray', `0 ${PIE_FULL};${PIE_FULL} 0`, '1.8s'))
  const kt = (v: number) => (v / 100).toFixed(2)
  return (
    ring +
    sweep(anim('stroke-dasharray', `0 ${PIE_FULL};0 ${PIE_FULL};${PIE_FULL} 0;${PIE_FULL} 0;0 ${PIE_FULL}`, '4.2s', `keyTimes="0;${kt(at + 1)};${kt(at + 10)};0.90;1"`))
  )
}
const pieWalk = (p: Progress, W: number): string => {
  const { d, isCur } = stateOf(p)
  const g = nodesOf(p, W, 13, 18)
  let body = ''
  for (let i = g.lo; i < g.hi - 1; i++) {
    const from = isCur && i === d ? g.at(i) + g.L : g.at(i) + PIE_R + 2
    body += bar(from, g.at(i + 1) - PIE_R - 2, i < d ? ORANGE : EMPTY)
  }
  for (let i = g.lo; i < g.hi; i++) {
    const cx = g.at(i)
    if (i < d) body += pie(cx, 'done')
    else if (isCur && i === d) body += pie(cx, 'cur') + (g.label ? text(cx + 13, FONT, 700, TEXT, g.label) : '')
    else body += pie(cx, 'todo')
  }
  return doc(W, body)
}
const pieN = (W: number): number => Math.max(1, Math.floor((W - 16) / IDLE_SP) + 1)
const piePace = (W: number): string => {
  const n = pieN(W)
  let body = ''
  for (let i = 0; i < n; i++) body += pie(8 + i * IDLE_SP, 'idle', Math.floor((i * 70) / n))
  return doc(W, body)
}

// ---------- Comet + stepper ----------

const COMET_OP = [1, 0.7, 0.5, 0.35, 0.2, 0.1]
/** A comet with its head at `x`: six circles shrinking and fading behind it. */
const comet = (x: number): string =>
  COMET_OP.map((o, i) => `<circle cx="${num(x - i * 7)}" cy="${CY}" r="${4 - Math.floor(i / 2)}" fill="${ORANGE}" opacity="${o}"/>`).join('')
const DUR = '1.6s'
const cometWalk = (p: Progress, W: number): string => {
  const { n, d, fin, isCur } = stateOf(p)
  const g = nodesOf(p, W, 12, 18)
  const cur = g.at(Math.min(d, n - 1))
  let body = ''
  if (fin) body += bar(0, W, ORANGE)
  else {
    body += bar(0, cur, ORANGE)
    body += bar(isCur ? cur + g.L : cur, W, EMPTY)
  }
  for (let i = g.lo; i < g.hi; i++) {
    const cx = num(g.at(i))
    if (i < d) body += `<circle cx="${cx}" cy="${CY}" r="5" fill="${ORANGE}"/>`
    else if (isCur && i === d) {
      body += `<circle cx="${cx}" cy="${CY}" r="5" fill="none" stroke="${ORANGE}" stroke-width="2"/>`
      body += `<circle cx="${cx}" cy="${CY}" r="5" fill="${ORANGE}" opacity="0">${anim('opacity', '0;1;0;0', DUR, 'keyTimes="0;.6;.75;1"')}</circle>`
      body += `<circle cx="${cx}" cy="${CY}" r="5" fill="none" stroke="${ORANGE}" stroke-width="1.8" opacity="0">${anim('r', '5;5;11', DUR, 'keyTimes="0;.6;1"')}${anim('opacity', '0;0;1;0', DUR, 'keyTimes="0;.59;.6;1"')}</circle>`
      if (g.label) body += text(g.at(i) + 12, FONT, 700, TEXT, g.label)
    } else body += `<circle cx="${cx}" cy="${CY}" r="4" fill="none" stroke="${EMPTY}" stroke-width="2"/>`
  }
  if (isCur) {
    const run = Math.max(0, cur - 8)
    body +=
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;${num(run)} 0;${num(run)} 0" keyTimes="0;.6;1" dur="${DUR}" repeatCount="indefinite"/>` +
      anim('opacity', '1;1;0;0', DUR, 'keyTimes="0;.6;.62;1"') +
      comet(8) +
      '</g>'
  }
  return doc(W, body)
}
const cometPace = (W: number): string =>
  doc(
    W,
    bar(0, W, EMPTY) +
      `<g opacity="0"><animateTransform attributeName="transform" type="translate" values="0 0;${num(Math.max(0, W - 8))} 0" dur="2.2s" repeatCount="indefinite"/>` +
      anim('opacity', '0;1;1;0', '2.2s', 'keyTimes="0;.08;.85;1"') +
      comet(0) +
      '</g>',
  )

// ---------- The themes ----------

export const THEME_IDS = ['calm', 'vitals', 'bridge', 'wake', 'dial', 'comet'] as const
export type ThemeId = (typeof THEME_IDS)[number]
export const DEFAULT_THEME: ThemeId = 'comet'
/** What `/wavebar progress` lists for each theme: its name and what it does. */
export const THEME_NAMES: Record<ThemeId, string> = {
  calm: 'Calm: one quiet segment per step, the current one breathing. The least motion',
  vitals: 'Vitals: a monitor pen writes each finished step as a heartbeat; a heart beats at the step in progress',
  bridge: "Bridge: a starship console, every step a labelled panel, the active one blinking",
  wake: 'Wake: the step names as breadcrumbs, riding a wave that swells under the current step',
  dial: 'Dial: every step a dial that fills like a clock hand; full dials are done',
  comet: 'Comet: a comet streaks to the current step and sets it ringing',
}

export const THEMES: Record<ThemeId, Theme> = {
  calm: {
    walk: (p, W) => walkSvg(p.done, p.total, W, p.hasCurrent, p.isFinished),
    pace: W => paceSvg(W),
    names: false,
    info: false,
  },
  vitals: { walk: heartWalk, pace: heartPace, names: true, info: false },
  bridge: { walk: consoleWalk, pace: consolePace, names: true, info: true },
  wake: { walk: waveWalk, pace: wavePace, names: true, info: false },
  dial: { walk: pieWalk, pace: piePace, names: true, info: false },
  comet: { walk: cometWalk, pace: cometPace, names: true, info: false },
}

/** The ids the first version used, still accepted: a saved choice or a typed one keeps working. */
const OLD_IDS: Record<string, ThemeId> = { segments: 'calm', heartbeat: 'vitals', console: 'bridge', wave: 'wake', pie: 'dial' }

export const isThemeId = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v)

/** A theme id from what was saved or typed, old ids included; null for anything else. */
export const themeIdOf = (v: unknown): ThemeId | null =>
  isThemeId(v) ? v : typeof v === 'string' && Object.prototype.hasOwnProperty.call(OLD_IDS, v) ? OLD_IDS[v] : null
