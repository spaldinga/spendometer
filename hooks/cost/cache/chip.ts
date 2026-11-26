// The WARM/COLD chip and Robo in the band's row, and the cache economics the chip's hover shows (what keeping warm
// costs against going cold). Pure: each drawing returns an SVG string the band hands to Svg.

import { HUE, ICE, INK, svgDoc } from '../../band/look'
import type { Mode } from '../../band/look'
import { MODELS, coldCost, costOf, modelName, usd } from '../prices'
import { TTL_MIN, mineModel } from './facts'
import type { CacheView } from './facts'

export const WORD: Record<Mode, string> = { warm: 'WARM', cold: 'COLD' }

/** cache-tax pings once per 50 idle minutes: 1.2 pings an hour, each reading the whole context. */
export const PINGS_PER_HOUR = 1.2

/**
 * What keeping the cache warm costs, against letting it go cold: dollars an hour of pings (cache reads of
 * the context, no output), the cold re-cache cost of the next message, and the idle hours at which the
 * two are equal. Null for a model the table doesn't price.
 */
export const keepWarmCost = (v: CacheView): { perHour: number; cold: number; breakEvenH: number } | null => {
  const m = mineModel(v)
  if (!m) return null
  const perHour = costOf(m, 'warm', v.tokens) * PINGS_PER_HOUR
  const cold = costOf(m, 'cold', v.tokens)
  return { perHour, cold, breakEvenH: perHour > 0 ? cold / perHour : Infinity }
}

/** The models whose cold re-cache costs less than this session's own, in MODELS order, each as `Sonnet $0.96`. */
export const cheaperModels = (v: CacheView): string[] => {
  const own = mineModel(v)
  return own ? MODELS.filter(m => coldCost(m, v.tokens) < coldCost(own, v.tokens)).map(m => `${modelName(m)} ${usd(coldCost(m, v.tokens))}`) : []
}

/**
 * The hover text of the WARM/COLD chip: the keep-warm figures that used to be a card column. `keep` is the
 * conversation's switch (null when cache-tax runs it and there is no switch); `saved` what pings have saved.
 */
export const chipTip = (v: CacheView, saved: number, keep: boolean | null): string => {
  const left = Math.max(0, TTL_MIN - v.idleMin)
  const kw = keepWarmCost(v)
  if (!kw) return v.mode === 'cold' ? `Cold, idle ${v.idle}` : `Warm, cold in ${left}m`
  if (v.mode === 'cold') {
    const cheaper = cheaperModels(v)
    return `Cold, idle ${v.idle}. The next message re-caches for ${usd(kw.cold)} on ${modelName(mineModel(v)!)}${cheaper.length ? ` (cheaper: ${cheaper.join(', ')})` : ''}. Keep warm costs ${usd(kw.perHour)} an hour.`
  }
  return (
    `Warm for ${left} more ${left === 1 ? 'minute' : 'minutes'}` +
    (keep === null ? '' : ` · keep warm ${keep ? 'on' : 'off'}, ${usd(kw.perHour)} an hour`) +
    `. Going cold would cost ${usd(kw.cold)} to re-cache` +
    (saved > 0 ? ` · saved ${usd(saved)} so far` : '') +
    '.'
  )
}

/** The break-even as the card writes it: ~3h, or >24h when it is longer than a day. */
export const fmtBreakEven = (h: number): string => (h > 24 ? '>24h' : `~${Math.max(1, Math.round(h))}h`)

// ---------- Rounded chips (WARM, COLD, YOU) ----------
// A text background can't be rounded, so a chip is a small drawing. The mod can't
// measure text, so each chip's size was measured once, in the
// embedded font: width = the word plus 0.62 em of padding each side, height 1.65 em.
const CHIP: Record<string, { w: number; h: number }> = {
  'WARM@13': { w: 63, h: 21 },
  'COLD@13': { w: 58, h: 21 },
  'WARM@11': { w: 54, h: 18 },
  'COLD@11': { w: 50, h: 18 },
  'YOU@10': { w: 36, h: 17 },
}

/** Chip size when a word and size were not measured: the text's width per character and padding, and the height, as shares of the font size; the corner radius as a share of the height; the text baseline below the middle as a share of the font size. */
const CHIP_CHAR_W = 0.8
const CHIP_PAD = 1.24
const CHIP_H = 1.65
const CHIP_RADIUS = 0.32
const CHIP_BASELINE = 0.36

export const chipShapes = (x: number, y: number, word: string, fill: string, size: number, ls: number): { w: number; h: number; svg: string } => {
  const { w, h } = CHIP[`${word}@${size}`] ?? { w: Math.round(word.length * size * CHIP_CHAR_W + size * CHIP_PAD), h: Math.round(size * CHIP_H) }
  return {
    w,
    h,
    svg:
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h * CHIP_RADIUS)}" fill="${fill}"/>` +
      `<text x="${x + w / 2}" y="${y + h / 2 + size * CHIP_BASELINE}" font-size="${size}" font-weight="700" letter-spacing="${ls}"` +
      ` text-anchor="middle" fill="${INK}">${word}</text>`,
  }
}

/** The WARM or COLD chip's font size (px) and letter spacing (px). */
const CHIP_FONT = 13
const CHIP_LS = 1

/** The WARM or COLD chip beside Robo in the band's row. */
export const chipSvg = (mode: Mode): { source: string; w: number; h: number } => {
  const c = chipShapes(0, 0, WORD[mode], HUE[mode], CHIP_FONT, CHIP_LS)
  return { source: svgDoc(c.w, c.h, c.svg, true), w: c.w, h: c.h }
}

// ---------- Robo: bobbing when warm, frozen in ice when cold ----------
const ROBO_PIX = ['..X..X..', 'XXXXXXXX', 'XXXXXXXX', 'X.XXXX.X', 'XXXXXXXX', 'XXXXXXXX', 'X..XX..X']

/** Robo's box in pixel units across: the warm drawing, and the cold one with its ice block around it. */
const WARM_UNITS = 10
const COLD_UNITS = 12.2
/** Animation periods in seconds: Robo's bob, its blink, the ice's twinkle. */
const BOB_S = 1.2
const BLINK_S = 3.4
const TWINKLE_S = 2.8

// One path, not a rect per pixel: separate rects at fractional sizes leave faint
// seams between them, while one path fills the shared edges solid.
const pixels = (u: number, fill: string): string => {
  let d = ''
  ROBO_PIX.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === 'X') d += `M${x * u} ${y * u}h${u}v${u}h${-u}z`
    }),
  )
  return `<path d="${d}" fill="${fill}"/>`
}

/** Robo in a box `size` pixels square, top-left at x, y. SMIL only, so the Svg needs isInteractive. */
export const roboShapes = (x: number, y: number, size: number, mode: Mode): string => {
  const ease = 'calcMode="spline" keyTimes="0;0.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"'
  if (mode === 'warm') {
    // Robo takes the WARM chip's red, so the two read as one badge.
    const ROBO = HUE.warm
    const u = size / WARM_UNITS
    const ox = x + u
    const oy = y + 1.6 * u
    return (
      `<g transform="translate(${ox} ${oy})" shape-rendering="crispEdges">` +
      `<ellipse cx="${4 * u}" cy="${7.75 * u}" rx="${3 * u}" ry="${0.42 * u}" fill="#000" opacity=".4" shape-rendering="auto">` +
      `<animate attributeName="rx" values="${3 * u};${2.3 * u};${3 * u}" dur="${BOB_S}s" repeatCount="indefinite" ${ease}/></ellipse>` +
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 ${-1.1 * u};0 0" dur="${BOB_S}s" repeatCount="indefinite" ${ease}/>` +
      pixels(u, ROBO) +
      // A blink every few seconds: the eye holes fill for a moment.
      `<g opacity="0"><rect x="${u}" y="${3 * u}" width="${u}" height="${u}" fill="${ROBO}"/><rect x="${6 * u}" y="${3 * u}" width="${u}" height="${u}" fill="${ROBO}"/>` +
      `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.9;0.91;0.95;1" dur="${BLINK_S}s" repeatCount="indefinite"/></g>` +
      `</g></g>`
    )
  }
  // Cold: still, pale, inside a rounded ice block with icicles and one twinkle.
  const u = size / COLD_UNITS
  const ice = ICE
  const ox = x + 1.6 * u
  const oy = y + 1.6 * u
  const bx = -1.2 * u
  const by = -1.2 * u
  const bw = 10.4 * u
  const bh = 9.4 * u
  let s = `<g transform="translate(${ox} ${oy})">`
  s += pixels(u, ice)
  s += `<rect x="${2 * u}" y="0" width="${u}" height="${u * 0.45}" fill="#fff" opacity=".9"/><rect x="${5 * u}" y="0" width="${u}" height="${u * 0.45}" fill="#fff" opacity=".9"/>`
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${1.5 * u}" fill="${HUE.cold}" fill-opacity=".28" stroke="${ice}" stroke-width="${0.38 * u}"/>`
  s += `<path d="M${bx + 0.9 * u} ${by + 2.6 * u}l${1.6 * u} ${-1.6 * u}M${bx + 0.9 * u} ${by + 4.2 * u}l${0.8 * u} ${-0.8 * u}" stroke="#fff" stroke-opacity=".75" stroke-width="${0.32 * u}" stroke-linecap="round"/>`
  for (const ix of [1.4, 4.4, 7.2]) {
    const tx = bx + ix * u
    const ty = by + bh
    s += `<path d="M${tx} ${ty}h${0.9 * u}l${-0.45 * u} ${1.5 * u}z" fill="${ice}"/>`
  }
  const sx = bx + bw - 0.2 * u
  const sy = by + 0.2 * u
  const r = 1.1 * u
  s +=
    `<path d="M${sx} ${sy - r}L${sx + 0.25 * r} ${sy - 0.25 * r}L${sx + r} ${sy}L${sx + 0.25 * r} ${sy + 0.25 * r}L${sx} ${sy + r}L${sx - 0.25 * r} ${sy + 0.25 * r}L${sx - r} ${sy}L${sx - 0.25 * r} ${sy - 0.25 * r}z" fill="#fff">` +
    `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.55;0.7;0.85;1" dur="${TWINKLE_S}s" repeatCount="indefinite"/></path>`
  return s + '</g>'
}

/** Robo beside the chip in the band's row. */
export const ROBO_SIZE = 26
export const roboSvg = (mode: Mode): string => svgDoc(ROBO_SIZE, ROBO_SIZE, roboShapes(0, 0, ROBO_SIZE, mode), false)
