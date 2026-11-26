// The usage windows' zone of the card: the pace strip. Pure: returns an SVG string the band places.

import { DANGER, EMPTY, MUTED, OK, TEXT } from '../../band/look'
import type { Kit } from '../../band/look'
import { PACE_TIP, fmtIdle } from './art'
import type { PaceRow } from './art'

// Geometry of the strip, in px of the card's SVG.
/** Left and right margin of the strip, the heading's baseline, font size and letter spacing. */
const PAD_X = 13
const HEAD_DY = 24
const HEAD_SIZE = 14
const HEAD_LS = 1.4
/** The note's baseline and font size when no usage window is reported. */
const EMPTY_DY = 49
const WORDS_SIZE = 18
/** Width of a word character as a share of its font size, for fitting the forecast to its room. */
const WORDS_CHAR_W = 0.56
/** Width of the label column (px), the track's share of the room left, and the gap between track and words (px). */
const LABEL_W = 34
const TRACK_SHARE = 0.55
const TRACK_GAP = 14
/** The windows drawn, the first row's top, the pitch between rows, and a row's text baseline below its top (px). */
const MAX_ROWS = 2
const ROW_TOP = 36
const ROW_PITCH = 28
const ROW_BASE_DY = 13
const LABEL_SIZE = 16
/** The track: its top below the row's top, its height, its shortest filled part, and the tick's width and height (px). */
const TRACK_DY = 4
const TRACK_H = 6
const TRACK_MIN_FILL = 3
const TICK_W = 2
const TICK_H = 14
/** Gap before the check mark (px). */
const MARK_DX = 4

// The pace strip, full width: one line a usage window. The label, a track (the bar is the share of the limit
// used, the tick is the share of the window's time gone: a bar past the tick is faster than the window allows,
// behind it is fine) and the forecast in words to the right of the track: "~48% at reset ✓" when the pace
// holds under 100%, "runs out in ~1h" otherwise. The whole strip is an SVG <title> (PACE_TIP), because the
// Box hover tips cannot target a region inside one Svg. The desktop draws the card
// at about 70%, so the words are 18 px here to read as about 13, the band's own size.
export const paceStrip = (k: Kit, pace: readonly PaceRow[]): string => {
  const { W, t } = k
  const g = t(PAD_X, HEAD_DY, 'PACE VS RESET', { size: HEAD_SIZE, ls: HEAD_LS })
  if (pace.length === 0) return g + t(PAD_X, EMPTY_DY, 'no usage windows reported', { size: WORDS_SIZE, w: 500 })
  const tx = PAD_X + LABEL_W
  const tw = Math.round((W - 2 * PAD_X - LABEL_W) * TRACK_SHARE)
  const wx = tx + tw + TRACK_GAP
  const room = W - PAD_X - wx
  type Words = { lead: string; fill: string; rest: string; mark?: string }
  const fits = (c: Words) => (c.lead.length + c.rest.length + (c.mark ? 2 : 0)) * WORDS_SIZE * WORDS_CHAR_W <= room
  const words = (yy: number, vs: Words[]) => {
    const c = vs.find(fits) ?? vs[vs.length - 1]
    return (
      `<text x="${wx}" y="${yy}" font-size="${WORDS_SIZE}" font-weight="500" fill="${MUTED}">` +
      `<tspan fill="${c.fill}">${c.lead}</tspan>${c.rest}` +
      (c.mark ? `<tspan fill="${OK}" font-weight="700" dx="${MARK_DX}">${c.mark}</tspan>` : '') +
      '</text>'
    )
  }
  let s = g
  pace.slice(0, MAX_ROWS).forEach((r, i) => {
    const top = ROW_TOP + i * ROW_PITCH
    const yb = top + ROW_BASE_DY
    s += t(PAD_X, yb, r.label, { size: LABEL_SIZE, fill: r.color })
    s += `<rect x="${tx}" y="${top + TRACK_DY}" width="${tw}" height="${TRACK_H}" rx="${TRACK_H / 2}" fill="${EMPTY}"/>`
    // The fill is what is used, red when the forecast runs out before the reset; the tick is the share of the
    // window's time already gone, none while the reset is unknown.
    const used = Math.max(0, Math.min(100, r.used ?? 0))
    if (used > 0) {
      const bw = Math.min(tw, Math.max(TRACK_MIN_FILL, Math.round((used / 100) * tw)))
      s += `<rect x="${tx}" y="${top + TRACK_DY}" width="${bw}" height="${TRACK_H}" rx="${TRACK_H / 2}" fill="${r.pace && !r.pace.ok ? DANGER : r.color}"/>`
    }
    if (r.untilResetMs !== null && r.windowMs && r.untilResetMs > 0 && r.untilResetMs <= r.windowMs) {
      const gone = 1 - r.untilResetMs / r.windowMs
      s += `<rect x="${tx + Math.min(tw - TICK_W, Math.max(0, Math.round(gone * tw) - 1))}" y="${top}" width="${TICK_W}" height="${TICK_H}" fill="${TEXT}"/>`
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
