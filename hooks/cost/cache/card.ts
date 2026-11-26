// The cache slice's zone of the card: CACHE DISCOUNT. Pure: returns an SVG string the band places.

import { HUE, MUTED, OK } from '../../band/look'
import type { Kit } from '../../band/look'
import { usd } from '../prices'
import { compareRows, figureWidth } from '../spend/card'

/** The split bar's top (px below the zone's top), height and the gap between its parts (px); each part is at least BAR_MIN_PART wide. */
const BAR_DY = 78
const BAR_H = 6
const BAR_GAP = 2
const BAR_MIN_PART = 3

// CACHE DISCOUNT: the share of input read from the cache, with the effective price a million tokens as its caption.
// Under the figure a bar split into the cached share and the rest; beside it two compare rows, keeping the cache
// warm for an hour against one cold re-cache (`kw`, in dollars), when known.
export const discountZone = (
  k: Kit,
  x: number,
  y: number,
  w: number,
  metrics: { hit: number | null; perM: number | null } | null,
  kw: { warm: number; cold: number } | null = null,
): string => {
  const { big, mdash, mhead, mwords } = k
  if (!metrics || metrics.hit === null) return mdash(x, y, w, 'CACHE DISCOUNT')
  const hit = Math.min(1, Math.max(0, metrics.hit))
  const figure = `${Math.round(hit * 100)}%`
  const bar = (bx: number, bw: number, fill: string) => `<rect x="${bx}" y="${y + BAR_DY}" width="${bw}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${fill}"/>`
  const r2 = (n: number) => Math.round(n * 100) / 100
  let split: string
  if (hit <= 0) split = bar(x, w, MUTED)
  else if (hit >= 1) split = bar(x, w, OK)
  else {
    const room = w - BAR_GAP
    const cached = Math.min(room - BAR_MIN_PART, Math.max(BAR_MIN_PART, hit * room))
    split = bar(x, r2(cached), OK) + bar(r2(x + cached + BAR_GAP), r2(room - cached), MUTED)
  }
  const top = kw ? Math.max(kw.warm, kw.cold) : 0
  const ratio = (v: number) => (top > 0 ? v / top : null)
  const rows = kw ? compareRows(k, x, y, w, figureWidth(figure, ''), [['warm', ratio(kw.warm), HUE.warm], ['cold', ratio(kw.cold), HUE.cold]]) : ''
  return mhead(x, y, 'CACHE DISCOUNT') + big(x, y + 62, figure, 38, '', 15) + rows + split + mwords(x, y, w, metrics.perM !== null ? `${usd(metrics.perM)} per 1M tokens` : 'of input read from cache')
}
