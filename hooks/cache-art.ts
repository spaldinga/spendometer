// The cache card's drawings. Pure: each function returns an SVG string the band
// hands to Svg. Nothing here touches the engine.

import { SANS } from './font'
import { RUNWAY_CAP } from './metrics'
import type { Metrics } from './metrics'
import { cardColsOf } from './layout'
import { resultsSentence, resultsText } from './results'
import type { Pace } from './pace'

export type Mode = 'warm' | 'cold'
export type Kind = 'wide' | 'stacked' | 'tight' | 'minimal'

// The band's own colours, measured from the app.
export const TEXT = '#e8e2d2'
export const MUTED = '#8d8775'
export const EMPTY = '#4a463b'
export const LINE = '#36332b'
export const ORANGE = '#ff6b1a'
export const YELLOW = '#f5a623'
/** A window that runs out before it resets. */
export const DANGER = '#e24b4a'
/** A window that lasts until it resets: a muted green beside DANGER. */
export const OK = '#1d9e75'

// The cache's two states in a muted shade: desaturated so they sit
// beside the band's own orange and yellow.
export const HUE: Record<Mode, string> = { warm: '#cc6363', cold: '#6aaabd' }
/** Fable's colour in the by-model split: a lavender beside the others. */
export const FABLE = '#b59fd0'
/** Each model family's colour in the by-model split. */
export const MODEL_COLOR: Record<string, string> = { opus: HUE.warm, sonnet: ORANGE, haiku: YELLOW, fable: FABLE }
/** Text on a filled chip. */
export const INK = '#1c1a16'
export const WORD: Record<Mode, string> = { warm: 'WARM', cold: 'COLD' }

// The console progress theme's palette, after a Star Trek-like panel: dark values here, light ones in LIGHT.
export const LC_OR = '#ff9900'
export const LC_PE = '#ffcc99'
export const LC_TA = '#cc9966'
export const LC_LA = '#cc99cc'
export const LC_BL = '#9999ff'
/** Text on the console's blocks. */
export const LC_INK = '#000000'

/** The prompt cache lives an hour after the last request that read or wrote it. */
export const TTL_MIN = 60
export const TTL_MS = TTL_MIN * 60 * 1000

/**
 * The band's width in CSS pixels for a column count: the engine keeps 5 cells
 * for its [-], and a cell is 12 px (the app's code font advance). Rounds down,
 * so the card never runs past the slot; the few pixels left are band colour.
 */
export const bandPx = (columns: number): number => (columns + 5) * 12

// $ per million tokens: input, output, and the cache read. The 1-hour cache write is 2 times
// input. Haiku 5.5 is $0.10 up to 100K tokens and $0.50 above; long sessions use the
// higher rate.
export type Model = { id: string; NAME: string; input: number; output: number; read: number }
export const MODELS: Model[] = [
  { id: 'fable', NAME: 'FABLE', input: 10, output: 50, read: 0.25 },
  { id: 'opus', NAME: 'OPUS', input: 4, output: 20, read: 0.2 },
  { id: 'sonnet', NAME: 'SONNET', input: 2, output: 10, read: 0.2 },
  { id: 'haiku', NAME: 'HAIKU', input: 0.5, output: 2.5, read: 0.05 },
]

/** Which row of MODELS a model id belongs to, or null for one the card doesn't price. */
export const familyOf = (model: string | null | undefined): string | null => {
  const m = (model ?? '').toLowerCase()
  return MODELS.find(x => m.includes(x.id))?.id ?? null
}

export const coldCost = (m: Model, tokens: number): number => (tokens / 1e6) * m.input * 2
export const warmCost = (m: Model, tokens: number): number => (tokens / 1e6) * m.read
export const costOf = (m: Model, mode: Mode, tokens: number): number => (mode === 'cold' ? coldCost(m, tokens) : warmCost(m, tokens))
/** What a turn reports having used, summed over its requests. */
export type TurnUsage = {
  model?: string | null
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * What a turn cost at list prices, or null for a model the table doesn't price.
 * An estimate, not a bill: cache writes are priced at the 1-hour rate.
 */
export const turnCost = (u: TurnUsage | null | undefined, fallbackModel?: string | null): number | null => {
  if (!u) return null
  const m = MODELS.find(x => x.id === familyOf(u.model || fallbackModel))
  if (!m) return null
  return (
    ((u.input_tokens || 0) * m.input +
      (u.output_tokens || 0) * m.output +
      (u.cache_read_input_tokens || 0) * m.read +
      (u.cache_creation_input_tokens || 0) * m.input * 2) /
    1e6
  )
}

export const usd = (n: number): string => '$' + n.toFixed(2)
export const tok = (n: number): string => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : n < 1000 ? `${Math.round(n)}` : `${Math.round(n / 1000)}k`)

/** Idle time the way the card writes it: 18m, 2h 5m, 3d 9h. */
export const fmtIdle = (ms: number): string => {
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** What every drawing of the cache reads. */
export type CacheView = {
  mode: Mode
  /** How long since the last request, written out: 3d 9h, 18m. */
  idle: string
  /** The same in whole minutes, for the warm countdown. */
  idleMin: number
  /** Context the next request re-sends. */
  tokens: number
  /** The model's context window. */
  window: number
  /** This session's MODELS id, or null when the model isn't priced. */
  mine: string | null
}

export const mineModel = (v: CacheView): Model | undefined => MODELS.find(m => m.id === v.mine)

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

/** A model as the card writes it: Opus, Sonnet. */
export const modelName = (m: Model): string => m.id[0].toUpperCase() + m.id.slice(1)

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

/**
 * A usage window as the pace zone draws it: its label and colour, when it resets and its pace (null while unknown),
 * the share used (0 to 100) and the window's length, which with the time to the reset gives the share of time gone.
 */
export type PaceRow = { label: string; color: string; untilResetMs: number | null; pace: Pace | null; used?: number; windowMs?: number | null }

/** What the white line in the pace strip means; the strip's hover text and part of the card's alt. */
export const PACE_TIP = "The white line is how much of the window's time has gone. A bar to the left of it is under pace, to the right is over pace."

// ---------- SVG helpers ----------
const mix = (a: string, b: string, t: number): string =>
  '#' +
  [1, 3, 5]
    .map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0'))
    .join('')

/** The frozen Robo's pale blue: the cold hue half way to white. */
export const ICE = mix(HUE.cold, '#ffffff', 0.5)

/**
 * The drawings' colours on a light background, by the dark colour each replaces: the one place both palettes
 * live. A drawing is painted in the dark palette; svgDoc adds a light-scheme style that swaps each colour by
 * attribute, so no drawing code knows about themes. Left alone on purpose: `#000` (the shadow under Robo,
 * translucent black, which reads on light as well as on dark).
 */
export const LIGHT: Record<string, string> = {
  [TEXT]: '#2b2a26',
  [MUTED]: '#6b675c',
  [EMPTY]: '#d9d4c7',
  [LINE]: '#e0dbcf',
  [ORANGE]: '#d4560c',
  [YELLOW]: '#a8700f',
  [HUE.warm]: '#b04545',
  [HUE.cold]: '#2c7a94',
  [FABLE]: '#7a5fa3',
  [OK]: '#0f7a57',
  [DANGER]: '#c03534',
  [INK]: '#ffffff',
  // The frozen Robo: pale on dark, a mid blue on light, with its white glints as a light blue so they still show.
  [ICE]: '#3a86a0',
  '#fff': '#8fc1d2',
  // The console theme of the progress row: orange, peach, tan, lavender and blue blocks with black ink.
  [LC_OR]: '#c06f00',
  [LC_PE]: '#b8743a',
  [LC_TA]: '#8a5a2b',
  [LC_LA]: '#8e5a8e',
  [LC_BL]: '#5555bb',
  [LC_INK]: '#ffffff',
}

const LIGHT_CSS =
  '@media (prefers-color-scheme: light){' +
  Object.entries(LIGHT)
    .map(([dark, light]) => `[fill="${dark}"]{fill:${light}} [stroke="${dark}"]{stroke:${light}}`)
    .join(' ') +
  '}'

/** Every drawing carries its style: the light-scheme colours, and the font when it has text. */
export const svgDoc = (w: number, h: number, body: string, font: boolean): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  '<style>' +
  (font ? `@font-face{font-family:RS;font-weight:100 900;src:url(data:font/woff2;base64,${SANS}) format('woff2')} text{font-family:RS,system-ui,'Segoe UI',sans-serif}` : '') +
  LIGHT_CSS +
  '</style>' +
  body +
  '</svg>'

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

export const chipShapes = (x: number, y: number, word: string, fill: string, size: number, ls: number): { w: number; h: number; svg: string } => {
  const { w, h } = CHIP[`${word}@${size}`] ?? { w: Math.round(word.length * size * 0.8 + size * 1.24), h: Math.round(size * 1.65) }
  return {
    w,
    h,
    svg:
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h * 0.32)}" fill="${fill}"/>` +
      `<text x="${x + w / 2}" y="${y + h / 2 + size * 0.36}" font-size="${size}" font-weight="700" letter-spacing="${ls}"` +
      ` text-anchor="middle" fill="${INK}">${word}</text>`,
  }
}

/** The WARM or COLD chip beside Robo in the band's row. */
export const chipSvg = (mode: Mode): { source: string; w: number; h: number } => {
  const c = chipShapes(0, 0, WORD[mode], HUE[mode], 13, 1)
  return { source: svgDoc(c.w, c.h, c.svg, true), w: c.w, h: c.h }
}

// ---------- Robo: bobbing when warm, frozen in ice when cold ----------
const ROBO_PIX = ['..X..X..', 'XXXXXXXX', 'XXXXXXXX', 'X.XXXX.X', 'XXXXXXXX', 'XXXXXXXX', 'X..XX..X']

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
    const u = size / 10
    const ox = x + u
    const oy = y + 1.6 * u
    return (
      `<g transform="translate(${ox} ${oy})" shape-rendering="crispEdges">` +
      `<ellipse cx="${4 * u}" cy="${7.75 * u}" rx="${3 * u}" ry="${0.42 * u}" fill="#000" opacity=".4" shape-rendering="auto">` +
      `<animate attributeName="rx" values="${3 * u};${2.3 * u};${3 * u}" dur="1.2s" repeatCount="indefinite" ${ease}/></ellipse>` +
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 ${-1.1 * u};0 0" dur="1.2s" repeatCount="indefinite" ${ease}/>` +
      pixels(u, ROBO) +
      // A blink every few seconds: the eye holes fill for a moment.
      `<g opacity="0"><rect x="${u}" y="${3 * u}" width="${u}" height="${u}" fill="${ROBO}"/><rect x="${6 * u}" y="${3 * u}" width="${u}" height="${u}" fill="${ROBO}"/>` +
      `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.9;0.91;0.95;1" dur="3.4s" repeatCount="indefinite"/></g>` +
      `</g></g>`
    )
  }
  // Cold: still, pale, inside a rounded ice block with icicles and one twinkle.
  const u = size / 12.2
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
    `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.55;0.7;0.85;1" dur="2.8s" repeatCount="indefinite"/></path>`
  return s + '</g>'
}

/** Robo beside the chip in the band's row. */
export const ROBO_SIZE = 26
export const roboSvg = (mode: Mode): string => svgDoc(ROBO_SIZE, ROBO_SIZE, roboShapes(0, 0, ROBO_SIZE, mode), false)

// ---------- Pie: how much of a usage limit is used ----------
/** The usage pie's size in px: about 2 columns on the desktop (see PIE_COLS in layout.ts). */
export const PIE_SIZE = 16

/** The wedge's path for `pct` used (0 to 100) in a circle of radius r around cx, cy, from 12 o'clock clockwise; '' for 0, null for a full circle. */
export const wedgePath = (cx: number, cy: number, r: number, pct: number): string | null => {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0))
  if (p <= 0) return ''
  if (p >= 100) return null
  const a = (p / 100) * 2 * Math.PI
  const n = (v: number) => Math.round(v * 100) / 100
  return `M${cx} ${cy}L${cx} ${n(cy - r)}A${r} ${r} 0 ${p > 50 ? 1 : 0} 1 ${n(cx + r * Math.sin(a))} ${n(cy - r * Math.cos(a))}Z`
}

/** The pie's shapes at x, y: a full circle in EMPTY and the used share as a wedge in `color`. */
export const pieShapes = (x: number, y: number, size: number, pct: number, color: string): string => {
  const r = size / 2 - 1
  const cx = x + size / 2
  const cy = y + size / 2
  const w = wedgePath(cx, cy, r, pct)
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${w === null ? color : EMPTY}"/>` + (w ? `<path d="${w}" fill="${color}"/>` : '')
  )
}

/** The pie beside a usage window in the band's row. */
export const pieSvg = (pct: number, color: string): string => svgDoc(PIE_SIZE, PIE_SIZE, pieShapes(0, 0, PIE_SIZE, pct, color), false)

// ---------- Pace track: the 5h window's pace beside its percent in the band's top row ----------
/** The track's width in px a layout draws: wide, compact (stacked row) and tight. Their columns are PACE_TRACK_COLS in layout.ts. */
export const PACE_TRACK_PX = { wide: 64, compact: 44, tight: 30 } as const
export type PaceMode = keyof typeof PACE_TRACK_PX

/**
 * The mini track: the fill is the share of the limit used (DANGER when the pace runs out before the reset),
 * the 2 px tick in TEXT is the share of the window's time gone: the same meaning and colours as the card's
 * pace strip. `gone` is 0 to 1. Height is PIE_SIZE, so it sits in the pie's row.
 */
export const paceTrackSvg = (used: number, gone: number, color: string, ok: boolean, w: number): { source: string; w: number; h: number } => {
  const h = PIE_SIZE
  const u = Math.max(0, Math.min(100, used))
  let s = `<rect x="0" y="5" width="${w}" height="6" rx="3" fill="${EMPTY}"/>`
  if (u > 0) s += `<rect x="0" y="5" width="${Math.min(w, Math.max(3, Math.round((u / 100) * w)))}" height="6" rx="3" fill="${ok ? color : DANGER}"/>`
  const tx = Math.min(w - 2, Math.max(0, Math.round(Math.max(0, Math.min(1, gone)) * w) - 1))
  s += `<rect x="${tx}" y="1" width="2" height="14" fill="${TEXT}"/>`
  return { source: svgDoc(w, h, s, false), w, h }
}

/** The shortest unit of a duration: `1h 20m` is `1h`. */
const fmtShort = (ms: number): string => fmtIdle(ms).split(' ')[0]

/**
 * The 5h pace in words. On pace: `~48% at reset ✓` (wide), `✓` (compact, tight). Over pace: `out in ~1h 20m`
 * (wide), `out 1h` (compact, while `full`), `1h`. `text` is what is written (muted, or DANGER when !ok), `mark`
 * the green check; `line` is both with their leading space, for counting columns.
 */
export const paceWords = (p: Pace, mode: PaceMode, full = true): { text: string; mark: string; ok: boolean; line: string } => {
  const text = p.ok ? (mode === 'wide' ? `~${p.atReset}% at reset` : '') : mode === 'wide' ? `out in ~${fmtIdle(p.lastsMs)}` : `${mode === 'compact' && full ? 'out ' : ''}${fmtShort(p.lastsMs)}`
  const mark = p.ok ? '✓' : ''
  return { text, mark, ok: p.ok, line: ' ' + [text, mark].filter(Boolean).join(' ') }
}

// ---------- The card, laid out for the band's width ----------
type TextOpts = { size?: number; w?: number; fill?: string; ls?: number; anchor?: string }

/** A run time written out: 45s, 12m, 2h 5m. */
export const fmtSpan = (ms: number): string => (ms < 60000 ? `${Math.max(0, Math.round(ms / 1000))}s` : fmtIdle(ms))

/** A reset time written out: 3d 2h, 4h 1m, 35m. */
export const fmtReset = (iso: string | undefined, now: number): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'resetting'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/**
 * What this conversation has cost so far, split the way the card shows it; `days` is the account's daily
 * spend for the last 7 days, oldest first, today last; `saved` and `pings` are what keep-warm pings saved
 * and cost in this conversation.
 */
export type CardSpend = { main: number; subs: number; days?: number[]; saved?: number; pings?: number; commits?: number; prs?: number }

/** The card's tabs, and how they are named. */
export type Tab = 'overview' | 'context' | 'cost'
export const TABS: readonly Tab[] = ['overview', 'context', 'cost']
export const TAB_NAMES: Record<Tab, string> = { overview: 'Overview', context: 'Context', cost: 'Cost' }

/** The gap between the row and the card, drawn inside the card. */
const CARD_TOP = 6

/** The pace strip's height: its title and two one-line rows. */
const PACE_H = 88
/** The row of columns: 124 px, the runway line's room included. */
const ROW = 124
/** A status line's pitch, and what a block of them takes under its rule: the first baseline 24 px down, 7 px under the last. */
const STATUS_PITCH = 27
const statusH = (lines: number): number => STATUS_PITCH * lines + 4

// The card shows one tab at a time (Overview, Context or Cost). Overview is the pace strip across the top and
// under it DELEGATION and SPEND; Context is CONVERSATION SIZE (RE-CACHE once cold) and TOOL OUTPUT; Cost is
// CACHE DISCOUNT, PER MESSAGE and BY MODEL. Each takes as many columns as it has zones and fit (cardColsOf);
// a zone with no column of its own is a status line below. Keep warm is the chip's hover and the alt text,
// not a zone. The height depends on the width and the tab only, never on the data.
export const cardSvg = (v: CacheView, W: number, spend: CardSpend | null = null, pace: readonly PaceRow[] = [], metrics: Metrics | null = null, tab: Tab = 'overview'): { source: string; w: number; h: number; alt: string; cols: number } => {
  const mode = v.mode
  const cold = mode === 'cold'
  const HUEM = HUE[mode]
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const t = (x: number, y: number, str: string, o: TextOpts = {}) =>
    `<text x="${x}" y="${y}" font-size="${o.size || 11}" font-weight="${o.w || 700}" fill="${o.fill || MUTED}"` +
    ` letter-spacing="${o.ls ?? 0}" text-anchor="${o.anchor || 'start'}">${str}</text>`
  const vline = (x: number, y: number, h: number) => `<rect x="${x}" y="${y}" width="1" height="${h}" fill="${LINE}"/>`
  const hline = (y: number) => `<rect x="13" y="${y}" width="${W - 26}" height="1" fill="${LINE}"/>`
  /** The first of `variants` that fits `px` (a character is estimated at 0.56 em: the mod cannot measure text), else the last. */
  const pick = (variants: string[], px: number, size: number, em = 0.56) => variants.find(s => s.length * size * em <= px) ?? variants[variants.length - 1]
  /** A column caption: the card reserves CARD_COL_PX for 33 characters at 18 px, so 0.53 em a character here. */
  const capPick = (variants: string[], px: number, size: number) => pick(variants, px, size, 0.53)

  const mainCost = spend?.main ?? 0
  const subsCost = spend?.subs ?? 0
  const total = mainCost + subsCost
  const free = Math.max(0, v.window - v.tokens)
  const share = v.window > 0 ? Math.min(1, v.tokens / v.window) : 0

  // A zone's big figure with its small unit after it.
  const big = (x: number, yy: number, figure: string, bs: number, unit: string, ts: number, fill = TEXT) =>
    `<text x="${x}" y="${yy}" font-weight="600" fill="${fill}"><tspan font-size="${bs}">${figure}</tspan>` +
    (unit ? `<tspan font-size="${ts}" font-weight="500" fill="${MUTED}" dx="7">${unit}</tspan>` : '') +
    '</text>'
  /** Dots in `rows` rows of `cols`, each dot coloured by its index. */
  const dots = (gx: number, gy: number, cols: number, step: number, rows: number, fill: (i: number) => string) => {
    let d = ''
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) d += `<circle cx="${gx + 3 + c * step}" cy="${gy + r * 9}" r="3" fill="${fill(r * cols + c)}"/>`
    return d
  }
  // A zone's caption size: a little smaller where the zone is narrow.
  // Drawn at 12 px a column, shown at DESKTOP_COL_PX (8.6): about 70%. 18 shows as about 13 px, the band's own text size.
  const capSize = (w: number) => (w < 230 ? 16 : 18)

  // The runway as a second caption line under IN CACHE, once the context growth is known.
  const runwayTurns =
    metrics && metrics.runway !== null && metrics.growth !== null ? (metrics.runway > RUNWAY_CAP ? `>${RUNWAY_CAP}` : `~${Math.round(metrics.runway)}`) : ''
  const runwayLine = runwayTurns ? `${runwayTurns} turns left at +${metrics!.growth! >= 1000 ? tok(metrics!.growth!) : Math.round(metrics!.growth!)} a turn` : ''
  const pct = Math.round(share * 100)
  const zoneSize = (x: number, y: number, w: number, o: { runway?: string[] } = {}) => {
    const caption = capPick([`${pct}% of the ${tok(v.window)} context · ${tok(free)} free`, `${pct}% of ${tok(v.window)} · ${tok(free)} free`], w, capSize(w))
    const g = t(x, y + 24, cold ? 'RE-CACHE' : 'CONVERSATION SIZE', { size: 14, ls: 1.4 })
    // 25 dots a row on the page; fewer only where the band is too narrow for them.
    const cols = Math.max(10, Math.min(25, Math.floor(w / 9.6)))
    const lit = Math.round(share * cols * 2)
    const fill = (i: number) => (i < lit ? HUEM : EMPTY)
    // With the runway line the figure, dots and first caption move up to leave the row's last 24 px for it.
    if (o.runway && o.runway.length) {
      return (
        g +
        big(x, y + 60, tok(v.tokens), 38, 'tokens', 15) +
        dots(x, y + 68, cols, 9.6, 2, fill) +
        t(x, y + 98, esc(caption), { size: capSize(w), w: 500 }) +
        t(x, y + 118, esc(capPick(o.runway, w, capSize(w))), { size: capSize(w), w: 500 })
      )
    }
    return g + big(x, y + 62, tok(v.tokens), 38, 'tokens', 15) + dots(x, y + 80, cols, 9.6, 2, fill) + t(x, y + 108, esc(caption), { size: capSize(w), w: 500 })
  }

  // The account's spend over the last 7 days, when the card knows it and any of it is above zero.
  const days = spend?.days && spend.days.some(d => d > 0) ? spend.days.slice(-7) : null
  const today = days ? days[days.length - 1] : 0
  const week = days ? days.reduce((a, b) => a + b, 0) : 0
  const daysCaption = days ? `today ${usd(today)} · week ${usd(week)}` : ''
  /** What the spend zone and its status line add to the total: the days, or the split of main and subagents; none when nothing is spent. */
  const spendCaptions = days ? [daysCaption] : total > 0 ? [`main ${usd(mainCost)} · subagents ${usd(subsCost)}`, `main ${usd(mainCost)} · subs ${usd(subsCost)}`] : []

  // The commits and pull requests this conversation made, and what a result cost: its own caption line in the
  // SPEND column (longest first) and a lead for the status line.
  const commits = Math.max(0, spend?.commits ?? 0)
  const prs = Math.max(0, spend?.prs ?? 0)
  const results = commits + prs
  const resultsBase = results > 0 ? resultsText(commits, prs) : ''
  const perResult = results > 0 && total > 0 ? total / results : null
  const resultCaptions = results > 0 ? [...(perResult !== null ? [`${resultsBase} · ≈${usd(perResult)} a result`, `${resultsBase} · ${usd(perResult)} each`] : []), resultsBase] : []

  /** One bar a day, oldest to today, scaled to the busiest; today in the band's orange, a day with no spend a 2 px stub. */
  const dayBars = (x: number, base: number, maxH: number) => {
    if (!days) return ''
    const gap = 4
    const bw = 12
    const top = Math.max(...days)
    return days
      .map((d, i) => {
        const h = d > 0 ? Math.max(3, Math.round((d / top) * maxH)) : 2
        const fill = d <= 0 ? EMPTY : i === days.length - 1 ? ORANGE : MUTED
        return `<rect x="${x + i * (bw + gap)}" y="${base - h}" width="${bw}" height="${h}" rx="1" fill="${fill}"/>`
      })
      .join('')
  }

  // What is spent: this thread's total, and either the last 7 days as bars or, with no daily figures, dots
  // split between the main session and subagents.
  const zoneSpend = (x: number, y: number, w: number) => {
    const caption = spendCaptions.length ? capPick(spendCaptions, w, capSize(w)) : ''
    const g = t(x, y + 24, 'SPEND', { size: 14, ls: 1.4 })
    const fig = `≈${usd(total)}`
    const split = (n: number) => {
      // The subagents' share, at least one dot once they have cost anything.
      const subDots = total <= 0 || subsCost <= 0 ? 0 : Math.min(n - 1, Math.max(1, Math.round((subsCost / total) * n)))
      return (i: number) => (total <= 0 ? EMPTY : i < n - subDots ? HUEM : MUTED)
    }
    const cols = Math.max(10, Math.min(25, Math.floor(w / 9.6)))
    // With the results line the figure, chart and first caption move up, as in IN CACHE with its runway line.
    if (resultCaptions.length) {
      const chart = days ? dayBars(x, y + 80, 12) : dots(x, y + 68, cols, 9.6, 2, split(cols * 2))
      return (
        g +
        big(x, y + 60, fig, 38, 'this thread', 15) +
        chart +
        (caption ? t(x, y + 98, caption, { size: capSize(w), w: 500 }) : '') +
        t(x, y + 118, esc(capPick(resultCaptions, w, capSize(w))), { size: capSize(w), w: 500 })
      )
    }
    const chart = days ? dayBars(x, y + 90, 20) : dots(x, y + 80, cols, 9.6, 2, split(cols * 2))
    return g + big(x, y + 62, fig, 38, 'this thread', 15) + chart + (caption ? t(x, y + 108, caption, { size: capSize(w), w: 500 }) : '')
  }

  // The keep-warm figures: no column on the card any more (they are the chip's hover), only the alt text.
  const own = mineModel(v)
  const name = modelName
  const cheaper = cheaperModels(v)
  const kw = keepWarmCost(v)
  const saved = spend?.saved ?? 0

  // DELEGATION: what subagents saved, two compare rows (cost and time against doing it all on the main model, one
  // after another) beside the figure, and the work done against the time it took. While the figure is unknown it
  // shows a dash and says when it will not be.
  const zoneDeleg = (x: number, y: number, w: number) => {
    const g = t(x, y + 24, 'DELEGATION', { size: 14, ls: 1.4 })
    const cap = capSize(w)
    const words = (s: string) => t(x, y + 108, esc(s), { size: cap, w: 500 })
    const dash = big(x, y + 62, '—', 38, '', 15)
    if (!metrics) return g + dash + words('after a few turns')
    const d = metrics.deleg
    if (!d) return g + dash + words(capPick(metrics.subs > 0 ? ['tracked from the next subagent', 'tracked from next subagent'] : ['no subagents this thread'], w, cap))
    const figure = `≈${usd(d.saved)}`
    const figW = figure.length * 38 * 0.6 + 7 + 'saved'.length * 15 * 0.56
    const rx = x + Math.max(Math.round(figW) + 16, Math.round(w / 2))
    const tx = rx + 40
    const tw = x + w - tx
    let rows = ''
    if (tw >= 30) {
      const compare = (ty: number, label: string, ratio: number | null, fill: string) => {
        const fw = ratio === null ? 0 : Math.min(tw, Math.max(ratio > 0 ? 3 : 0, Math.round(ratio * tw)))
        return (
          t(rx, ty + 6, label, { size: 14, w: 600 }) +
          `<rect x="${tx}" y="${ty}" width="${tw}" height="6" rx="3" fill="${EMPTY}"/>` +
          (fw > 0 ? `<rect x="${tx}" y="${ty}" width="${fw}" height="6" rx="3" fill="${fill}"/>` : '')
        )
      }
      rows = compare(y + 40, 'cost', d.costRatio, ORANGE) + compare(y + 56, 'time', d.workMs > 0 && d.wallMs > 0 ? Math.min(1, d.wallMs / d.workMs) : null, YELLOW)
    }
    const speed = d.workMs > 0 && d.wallMs > 0 ? (d.workMs / d.wallMs).toFixed(1) : null
    const variants =
      speed === null
        ? ['run time not recorded']
        : [
            `${fmtSpan(d.workMs)} of agent work in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
            `${fmtSpan(d.workMs)} work in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
            `${fmtSpan(d.workMs)} in ${fmtSpan(d.wallMs)} · ${speed}× faster`,
          ]
    return g + big(x, y + 62, figure, 38, 'saved', 15, OK) + rows + words(capPick(variants, w, cap))
  }

  // The pace strip, full width: one line a usage window. The label, a track (the bar is the share of the limit
  // used, the tick is the share of the window's time gone: a bar past the tick is faster than the window allows,
  // behind it is fine) and the forecast in words to the right of the track: "~48% at reset ✓" when the pace
  // holds under 100%, "runs out in ~1h" otherwise. The whole strip is an SVG <title> (PACE_TIP), because the
  // Box hover tips cannot target a region inside one Svg. The desktop draws the card
  // at about 70%, so the words are 18 px here to read as about 13, the band's own size.
  const paceStrip = () => {
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

  // The metric zones of the Context and Cost tabs: each is shaped like the other zones (a title, a 38 px figure
  // with its unit, a caption on the row's last line) and says so while its figure is unknown.
  const mhead = (x: number, y: number, title: string) => t(x, y + 24, title, { size: 14, ls: 1.4 })
  const mwords = (x: number, y: number, w: number, str: string) => t(x, y + 108, esc(str), { size: capSize(w), w: 500 })
  const mdash = (x: number, y: number, w: number, title: string) => mhead(x, y, title) + big(x, y + 62, '—', 38, '', 15) + mwords(x, y, w, 'after a few turns')
  const famName = (id: string) => id[0].toUpperCase() + id.slice(1)

  // CACHE DISCOUNT: the share of input read from the cache, with the effective price a million tokens as its caption.
  const zoneDiscount = (x: number, y: number, w: number) => {
    if (!metrics || metrics.hit === null) return mdash(x, y, w, 'CACHE DISCOUNT')
    return mhead(x, y, 'CACHE DISCOUNT') + big(x, y + 62, `${Math.round(metrics.hit * 100)}%`, 38, '', 15) + mwords(x, y, w, metrics.perM !== null ? `${usd(metrics.perM)} per 1M tokens` : 'of input read from cache')
  }

  // PER MESSAGE: the average cost of a message; the last one is the caption, flagged in the danger colour when it is far above the average.
  const zoneAvg = (x: number, y: number, w: number) => {
    if (!metrics || metrics.avg === null) return mdash(x, y, w, 'PER MESSAGE')
    const last =
      metrics.last === null
        ? ''
        : `<text x="${x}" y="${y + 108}" font-size="${capSize(w)}" font-weight="500" fill="${MUTED}">last ${usd(metrics.last)}` +
          (metrics.multiple !== null ? `<tspan fill="${DANGER}" font-weight="700"> · ${metrics.multiple}× avg</tspan>` : '') +
          '</text>'
    return mhead(x, y, 'PER MESSAGE') + big(x, y + 62, usd(metrics.avg), 38, 'avg', 15) + last
  }

  // BY MODEL: the biggest share as the figure, a split bar of all shares and each model's cost as the caption.
  const zoneModels = (x: number, y: number, w: number) => {
    const models = metrics?.models ?? []
    const spentBy = models.reduce((a, [, c]) => a + c, 0)
    if (models.length === 0 || spentBy <= 0) return mdash(x, y, w, 'BY MODEL')
    const size = capSize(w)
    const [topId, topCost] = models[0]
    const fig =
      `<text x="${x}" y="${y + 62}" font-weight="600" fill="${TEXT}"><tspan font-size="38">${famName(topId)}</tspan>` +
      `<tspan font-size="38" fill="${MODEL_COLOR[topId] ?? TEXT}" dx="10">${Math.round((topCost / spentBy) * 100)}%</tspan></text>`
    // The split bar: 6 px tall, 2 px between the parts, as wide as the column.
    const gap = 2
    const room = w - gap * (models.length - 1)
    let ws = models.map(([, c]) => Math.max(3, (c / spentBy) * room))
    const sum = ws.reduce((a, b) => a + b, 0)
    if (sum > room) ws = ws.map(s => (s * room) / sum)
    let bx = x
    let bar = ''
    models.forEach(([id], k) => {
      bar += `<rect x="${Math.round(bx * 100) / 100}" y="${y + 78}" width="${Math.round(ws[k] * 100) / 100}" height="6" rx="3" fill="${MODEL_COLOR[id] ?? MUTED}"/>`
      bx += ws[k] + gap
    })
    // The first entry is the figure's model, so only its cost; entries are cut from the back until the line fits.
    let list = models.map(([id, c], k) => ({ id, text: k === 0 ? usd(c) : `${famName(id)} ${usd(c)}` }))
    const len = (l: typeof list) => l.map(e => `■ ${e.text}`).join(' · ').length
    while (list.length > 1 && len(list) * size * 0.56 > w) list = list.slice(0, -1)
    const cap =
      `<text x="${x}" y="${y + 108}" font-size="${size}" font-weight="500" fill="${MUTED}">` +
      list.map((e, k) => `${k ? ' · ' : ''}<tspan fill="${MODEL_COLOR[e.id] ?? MUTED}">■</tspan> ${esc(e.text)}`).join('') +
      '</text>'
    return mhead(x, y, 'BY MODEL') + fig + bar + cap
  }

  // TOOL OUTPUT: tokens of tool output in the main context as the figure; the top tools as the caption, with the
  // re-reads of unchanged files in orange after them. Tools are cut from the back until the line fits; the re-read part stays.
  const zoneTools = (x: number, y: number, w: number) => {
    if (!metrics || metrics.toolTok <= 0) return mdash(x, y, w, 'TOOL OUTPUT')
    const size = capSize(w)
    const reread = metrics.rereads > 0 ? `${metrics.rereads} re-read${metrics.rereads === 1 ? '' : 's'}` : ''
    let list = metrics.tools.map(([k, n]) => `${k} ${tok(n)}`)
    const len = (l: string[]) => (l.join(' · ') + (reread ? (l.length ? ' · ' : '') + reread : '')).length
    while (list.length > 1 && len(list) * size * 0.56 > w) list = list.slice(0, -1)
    const cap =
      `<text x="${x}" y="${y + 108}" font-size="${size}" font-weight="500" fill="${MUTED}">` +
      esc(list.join(' · ')) +
      (reread ? `<tspan fill="${ORANGE}" font-weight="700">${list.length ? ' · ' : ''}${reread}</tspan>` : '') +
      '</text>'
    return mhead(x, y, 'TOOL OUTPUT') + big(x, y + 62, tok(metrics.toolTok), 38, 'tokens', 15) + cap
  }

  // One tab at a time. A zone is its drawing and, for a card too narrow for its column, the line it becomes below.
  type Zone = { draw: (x: number, y: number, w: number) => string; status?: { dot: string; variants: string[] } }
  const spendHead = `≈${usd(total)} this thread`
  const mm = metrics
  const modelsLine = mm && mm.models.length ? mm.models.map(([id, c]) => `${famName(id)} ${usd(c)}`) : []
  const zonesOf = (which: Tab): Zone[] =>
    which === 'overview'
      ? [
          { draw: zoneDeleg },
          { draw: zoneSpend, status: { dot: MUTED, variants: [...(resultCaptions.length ? resultCaptions.map(c => `${spendHead} · ${c}`) : []), ...spendCaptions.map(c => `${spendHead} · ${c}`), spendHead, `≈${usd(total)}`] } },
        ]
      : which === 'context'
        ? [
            { draw: (x, y, w) => zoneSize(x, y, w, { runway: runwayLine ? [runwayLine, `${runwayTurns} turns left`] : [] })},
            {
              draw: zoneTools,
              status: {
                dot: MUTED,
                variants:
                  mm && mm.toolTok > 0
                    ? [
                        `tool output ${tok(mm.toolTok)} tokens` + (mm.tools.length ? ` · ${mm.tools.map(([k, n]) => `${k} ${tok(n)}`).join(' · ')}` : '') + (mm.rereads > 0 ? ` · ${mm.rereads} re-read${mm.rereads === 1 ? '' : 's'}` : ''),
                        `tool output ${tok(mm.toolTok)} tokens` + (mm.rereads > 0 ? ` · ${mm.rereads} re-read${mm.rereads === 1 ? '' : 's'}` : ''),
                        `tool output ${tok(mm.toolTok)} tokens`,
                      ]
                    : ['tool output: after a few turns'],
              },
            },
          ]
        : [
            { draw: zoneDiscount, status: { dot: MUTED, variants: mm && mm.hit !== null ? [`cache discount ${Math.round(mm.hit * 100)}%` + (mm.perM !== null ? ` · ${usd(mm.perM)} per 1M tokens` : ''), `cache discount ${Math.round(mm.hit * 100)}%`] : ['cache discount: after a few turns'] } },
            {
              draw: zoneAvg,
              status: {
                dot: MUTED,
                variants:
                  mm && mm.avg !== null
                    ? [
                        `per message ${usd(mm.avg)} avg` + (mm.last !== null ? ` · last ${usd(mm.last)}` : '') + (mm.multiple !== null ? ` · ${mm.multiple}× avg` : ''),
                        `per message ${usd(mm.avg)} avg`,
                      ]
                    : ['per message: after a few turns'],
              },
            },
            { draw: zoneModels, status: { dot: MUTED, variants: modelsLine.length ? [`by model ${modelsLine.join(' · ')}`, `by model ${modelsLine.slice(0, 2).join(' · ')}`, `by model ${modelsLine[0]}`] : ['by model: after a few turns'] } },
          ]
  const zones = zonesOf(tab)

  // The columns: as many as fit, at most one a zone, 26 px between them, 13 px at the sides.
  const n = Math.min(zones.length, cardColsOf(W))
  const colW = Math.floor((W - 26 - (n - 1) * 26) / n)
  const colX = (i: number) => 13 + i * (colW + 26)
  // Only Overview has the pace strip; the others start at the top.
  const yc = tab === 'overview' ? PACE_H : 0
  let g = tab === 'overview' ? paceStrip() + hline(PACE_H) : ''
  for (let i = 0; i < n; i++) g += (i ? vline(colX(i) - 13, yc + 18, 88) : '') + zones[i].draw(colX(i), yc, colW)
  let H = yc + ROW

  // The zones with no column of their own, one status line each: a small dot, then the text. The text is the
  // longest variant that fits the line.
  const SS = W < 560 ? 16 : 18
  const lineRoom = W - 26 - 14
  const status = zones.slice(n).flatMap(z => (z.status ? [z.status] : []))
  if (status.length) {
    g += hline(H)
    status.forEach((s, k) => {
      const yy = H + 24 + k * STATUS_PITCH
      g += `<circle cx="17" cy="${yy - Math.round(SS * 0.36)}" r="4" fill="${s.dot}"/>` + t(27, yy, esc(pick(s.variants, lineRoom, SS)), { size: SS, w: 600, fill: TEXT })
    })
    H += statusH(status.length)
  }

  const h = H + CARD_TOP
  const body = `<g transform="translate(0 ${CARD_TOP})">` + hline(0) + g + '</g>'
  // What the tabs draw as shapes, in words, whichever tab is shown: the per-type subagent costs live only here.
  const m = metrics
  const delegAlt = metrics?.deleg
    ? ` Delegating saved about ${usd(metrics.deleg.saved)}; subagents ran ${fmtSpan(metrics.deleg.workMs)} of work in ${fmtSpan(metrics.deleg.wallMs)}.`
    : ''
  const metricsAlt = m
    ? (m.perM !== null ? ` Effective price about ${usd(m.perM)} per million tokens.` : '') +
      (m.models.length ? ` Cost by model: ${m.models.map(([id, c]) => `${famName(id)} ${usd(c)}`).join(', ')}.` : '') +
      (m.subs > 0 ? ` Subagents cost ${usd(m.subs)}${m.top.length ? ` (${m.top.map(([k, c]) => `${k} ${usd(c)}`).join(', ')})` : ''}.` : '') +
      (m.toolTok > 0
        ? ` Tool output into the context: about ${tok(m.toolTok)} tokens${m.tools.length ? ` (${m.tools.map(([k, n]) => `${k} ${tok(n)}`).join(', ')})` : ''}` +
          (m.rereads > 0 ? `; ${m.rereads} re-read${m.rereads === 1 ? '' : 's'} of unchanged files, about ${tok(m.rereadTok)} tokens` : '') +
          '.'
        : '') +
      delegAlt +
      (runwayLine ? ` Context runway: ${runwayLine}.` : '')
    : delegAlt
  const alt =
    `Tab: ${TAB_NAMES[tab]}. ` +
    (cold
      ? `Cache cold. Idle ${v.idle}. Next message re-caches ${tok(v.tokens)} tokens.`
      : `Cache warm. Goes cold in ${Math.max(0, TTL_MIN - v.idleMin)} minutes. ${tok(v.tokens)} tokens cached.`) +
    ` ${tok(free)} of the context free.` +
    ` This conversation has cost about ${usd(total)}${total > 0 ? ` (main ${usd(mainCost)}, subagents ${usd(subsCost)})` : ''}.` +
    (days ? ` Spend today ${usd(today)}, this week ${usd(week)}.` : '') +
    resultsSentence(commits, prs, perResult !== null ? usd(perResult) : null) +
    (saved > 0 ? ` Keep-warm pings have saved about ${usd(saved)}.` : '') +
    (kw ? ` Keeping the cache warm costs about ${usd(kw.perHour)} an hour; ${cold ? `re-caching now costs ${usd(kw.cold)} on ${name(own!)}${cheaper.length ? ` (cheaper: ${cheaper.join(', ')})` : ''}` : `going cold costs ${usd(kw.cold)}`}.` : '') +
    metricsAlt +
    (tab === 'overview' && pace.length > 0 ? ` ${PACE_TIP}` : '')
  return { source: svgDoc(W, h, body, true), w: W, h, alt, cols: n }
}
