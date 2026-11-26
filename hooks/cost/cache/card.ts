// The cache slice's zone of the card: CACHE DISCOUNT. Pure: returns an SVG string the band places.

import type { Kit } from '../../band/look'
import { usd } from '../prices'

// CACHE DISCOUNT: the share of input read from the cache, with the effective price a million tokens as its caption.
export const discountZone = (k: Kit, x: number, y: number, w: number, metrics: { hit: number | null; perM: number | null } | null): string => {
  const { big, mdash, mhead, mwords } = k
  if (!metrics || metrics.hit === null) return mdash(x, y, w, 'CACHE DISCOUNT')
  return mhead(x, y, 'CACHE DISCOUNT') + big(x, y + 62, `${Math.round(metrics.hit * 100)}%`, 38, '', 15) + mwords(x, y, w, metrics.perM !== null ? `${usd(metrics.perM)} per 1M tokens` : 'of input read from cache')
}
