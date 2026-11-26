import { BAR_CY } from '../art'
import { LC_BL, LC_INK, LC_LA, LC_OR, LC_PE, LC_TA } from '../../../band/look'
import type { Progress } from '../../../../types'
import { anim, cut, doc, nameAt, num, stateOf, text, textPx } from './kit'

const CAPS = 0.7
const SMALL = 11

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

export const bridgeWalk = (p: Progress, W: number): string => {
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
export const bridgePace = (W: number, info: string): string => {
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
