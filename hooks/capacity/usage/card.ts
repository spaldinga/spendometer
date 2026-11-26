// The usage windows' zone of the card: the pace strip. Pure: returns an SVG string the band places.

import { DANGER, EMPTY, MUTED, OK, TEXT } from '../../band/look'
import type { Kit } from '../../band/look'
import { PACE_TIP, fmtIdle } from './art'
import type { PaceRow } from './art'

// The pace strip, full width: one line a usage window. The label, a track (the bar is the share of the limit
// used, the tick is the share of the window's time gone: a bar past the tick is faster than the window allows,
// behind it is fine) and the forecast in words to the right of the track: "~48% at reset ✓" when the pace
// holds under 100%, "runs out in ~1h" otherwise. The whole strip is an SVG <title> (PACE_TIP), because the
// Box hover tips cannot target a region inside one Svg. The desktop draws the card
// at about 70%, so the words are 18 px here to read as about 13, the band's own size.
export const paceStrip = (k: Kit, pace: readonly PaceRow[]): string => {
  const { W, t } = k
  const g = t(13, 24, 'PACE VS RESET', { size: 14, ls: 1.4 })
  if (pace.length === 0) return g + t(13, 49, 'no usage windows reported', { size: 18, w: 500 })
  const tx = 13 + 34
  const tw = Math.round((W - 26 - 34) * 0.55)
  const wx = tx + tw + 14
  const room = W - 13 - wx
  type Words = { lead: string; fill: string; rest: string; mark?: string }
  const fits = (c: Words) => (c.lead.length + c.rest.length + (c.mark ? 2 : 0)) * 18 * 0.56 <= room
  const words = (yy: number, vs: Words[]) => {
    const c = vs.find(fits) ?? vs[vs.length - 1]
    return (
      `<text x="${wx}" y="${yy}" font-size="18" font-weight="500" fill="${MUTED}">` +
      `<tspan fill="${c.fill}">${c.lead}</tspan>${c.rest}` +
      (c.mark ? `<tspan fill="${OK}" font-weight="700" dx="4">${c.mark}</tspan>` : '') +
      '</text>'
    )
  }
  let s = g
  pace.slice(0, 2).forEach((r, i) => {
    const top = 36 + i * 28
    const yb = top + 13
    s += t(13, yb, r.label, { size: 16, fill: r.color })
    s += `<rect x="${tx}" y="${top + 4}" width="${tw}" height="6" rx="3" fill="${EMPTY}"/>`
    // The fill is what is used, red when the forecast runs out before the reset; the tick is the share of the
    // window's time already gone, none while the reset is unknown.
    const used = Math.max(0, Math.min(100, r.used ?? 0))
    if (used > 0) {
      const bw = Math.min(tw, Math.max(3, Math.round((used / 100) * tw)))
      s += `<rect x="${tx}" y="${top + 4}" width="${bw}" height="6" rx="3" fill="${r.pace && !r.pace.ok ? DANGER : r.color}"/>`
    }
    if (r.untilResetMs !== null && r.windowMs && r.untilResetMs > 0 && r.untilResetMs <= r.windowMs) {
      const gone = 1 - r.untilResetMs / r.windowMs
      s += `<rect x="${tx + Math.min(tw - 2, Math.max(0, Math.round(gone * tw) - 1))}" y="${top}" width="2" height="14" fill="${TEXT}"/>`
    }
    if (r.pace) {
      const lasts = fmtIdle(r.pace.lastsMs)
      const reset = fmtIdle(r.pace.untilResetMs)
      s += r.pace.ok
        ? words(yb, [
            { lead: `~${r.pace.atReset}% at reset`, fill: TEXT, rest: ` · resets ${reset}`, mark: '✓' },
            { lead: `~${r.pace.atReset}% at reset`, fill: TEXT, rest: '', mark: '✓' },
            { lead: `~${r.pace.atReset}%`, fill: TEXT, rest: '', mark: '✓' },
          ])
        : words(yb, [
            { lead: `runs out in ~${lasts}`, fill: DANGER, rest: ` · resets ${reset}` },
            { lead: `out in ~${lasts}`, fill: DANGER, rest: ` · resets ${reset}` },
            { lead: `out ~${lasts}`, fill: DANGER, rest: '' },
            { lead: `~${lasts}`, fill: DANGER, rest: '' },
          ])
    } else {
      s += words(yb, [
        { lead: 'pace unknown', fill: MUTED, rest: '' },
        { lead: 'unknown', fill: MUTED, rest: '' },
      ])
    }
  })
  return `<g><title>${PACE_TIP}</title>${s}</g>`
}
