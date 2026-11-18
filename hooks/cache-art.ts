// The cache card's drawings. Pure: each function returns an SVG string the band
// hands to Svg. Nothing here touches the engine.

import { SANS } from './font'
import type { Pace } from './pace'

export type Mode = 'warm' | 'cold'
export type Kind = 'wide' | 'stacked' | 'tight'

// The band's own colours, measured from the app.
export const TEXT = '#e8e2d2'
export const MUTED = '#8d8775'
export const EMPTY = '#4a463b'
export const LINE = '#36332b'
export const ORANGE = '#ff6b1a'
export const YELLOW = '#f5a623'
/** A window that runs out before it resets. */
export const DANGER = '#e24b4a'

// The cache's two states in a muted shade: desaturated so they sit
// beside the band's own orange and yellow.
export const HUE: Record<Mode, string> = { warm: '#cc6363', cold: '#6aaabd' }
/** Text on a filled chip. */
export const INK = '#1c1a16'
export const WORD: Record<Mode, string> = { warm: 'WARM', cold: 'COLD' }

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
export const tok = (n: number): string => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : `${Math.round(n / 1000)}k`)

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

/** The break-even as the card writes it: ~3h, or >24h when it is longer than a day. */
export const fmtBreakEven = (h: number): string => (h > 24 ? '>24h' : `~${Math.max(1, Math.round(h))}h`)

/** A usage window as the pace zone draws it: its label and colour, when it resets and its pace (null while unknown). */
export type PaceRow = { label: string; color: string; untilResetMs: number | null; pace: Pace | null }

/** The window most at risk: the one with the least time to spare past its reset (a negative margin runs out first). */
export const riskiest = (rows: readonly PaceRow[]): (PaceRow & { pace: Pace }) | null => {
  let best: (PaceRow & { pace: Pace }) | null = null
  for (const r of rows) {
    if (!r.pace) continue
    if (!best || r.pace.lastsMs - r.pace.untilResetMs < best.pace.lastsMs - best.pace.untilResetMs) best = r as PaceRow & { pace: Pace }
  }
  return best
}

// ---------- SVG helpers ----------
export const svgDoc = (w: number, h: number, body: string, font: boolean): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (font
    ? `<style>@font-face{font-family:RS;font-weight:100 900;src:url(data:font/woff2;base64,${SANS}) format('woff2')} text{font-family:RS,system-ui,'Segoe UI',sans-serif}</style>`
    : '') +
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

const mix = (a: string, b: string, t: number): string =>
  '#' +
  [1, 3, 5]
    .map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0'))
    .join('')

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
  const ice = mix(HUE.cold, '#ffffff', 0.5)
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

// ---------- The card, laid out for the band's width ----------
type TextOpts = { size?: number; w?: number; fill?: string; ls?: number; anchor?: string }

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

/** What this conversation has cost so far, split the way the card shows it. */
export type CardSpend = { main: number; subs: number }

/** The gap between the row and the card, drawn inside the card. */
const CARD_TOP = 6

// The card shows what the band's row does not: the size of the cache, what the conversation has
// cost, and, while the cache is cold, what the next message costs on each model.
export const cardSvg = (v: CacheView, kind: Kind, W: number, spend: CardSpend | null = null, pace: readonly PaceRow[] = []): { source: string; w: number; h: number; alt: string } => {
  const mode = v.mode
  const cold = mode === 'cold'
  const HUEM = HUE[mode]
  const t = (x: number, y: number, str: string, o: TextOpts = {}) =>
    `<text x="${x}" y="${y}" font-size="${o.size || 11}" font-weight="${o.w || 700}" fill="${o.fill || MUTED}"` +
    ` letter-spacing="${o.ls ?? 0}" text-anchor="${o.anchor || 'start'}">${str}</text>`
  const vline = (x: number, y: number, h: number) => `<rect x="${x}" y="${y}" width="1" height="${h}" fill="${LINE}"/>`
  const hline = (y: number) => `<rect x="13" y="${y}" width="${W - 26}" height="1" fill="${LINE}"/>`

  const mainCost = spend?.main ?? 0
  const subsCost = spend?.subs ?? 0
  const total = mainCost + subsCost
  const free = Math.max(0, v.window - v.tokens)
  const share = v.window > 0 ? Math.min(1, v.tokens / v.window) : 0

  // A zone's big figure with its small unit after it.
  const big = (x: number, yy: number, figure: string, bs: number, unit: string, ts: number) =>
    `<text x="${x}" y="${yy}" font-weight="600" fill="${TEXT}"><tspan font-size="${bs}">${figure}</tspan>` +
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
  const capSize = (w: number) => (w < 230 ? 11 : 12)

  // The conversation's size, as a dot grid of the context window.
  const zoneSize = (x: number, y: number, w: number, o: { compact?: boolean } = {}) => {
    const caption = `${Math.round(share * 100)}% of the ${tok(v.window)} context · ${tok(free)} free`
    const g = t(x, y + 24, cold ? 'RE-CACHE' : 'IN CACHE', { ls: 1.4 })
    if (o.compact) {
      const cols = 20
      const gx = x + w - (cols - 1) * 9.6 - 6
      const lit = Math.round(share * cols * 2)
      return g + big(x, y + 56, tok(v.tokens), 26, 'tokens', 14) + dots(gx, y + 42, cols, 9.6, 2, i => (i < lit ? HUEM : EMPTY)) + t(x, y + 76, caption, { size: capSize(w), w: 500 })
    }
    // 25 dots a row on the page; fewer only where the band is too narrow for them.
    const cols = Math.max(10, Math.min(25, Math.floor(w / 9.6)))
    const lit = Math.round(share * cols * 2)
    return g + big(x, y + 62, tok(v.tokens), 38, 'tokens', 15) + dots(x, y + 80, cols, 9.6, 2, i => (i < lit ? HUEM : EMPTY)) + t(x, y + 108, caption, { size: capSize(w), w: 500 })
  }

  // What this conversation has cost: the total, and the dots split between the main session and subagents.
  const zoneSpend = (x: number, y: number, w: number, o: { compact?: boolean } = {}) => {
    const caption = total > 0 ? `main ${usd(mainCost)} · subagents ${usd(subsCost)}` : ''
    const g = t(x, y + 24, 'THIS CONVERSATION', { ls: 1.4 })
    const fig = `≈${usd(total)}`
    const split = (n: number) => {
      // The subagents' share, at least one dot once they have cost anything.
      const subDots = total <= 0 || subsCost <= 0 ? 0 : Math.min(n - 1, Math.max(1, Math.round((subsCost / total) * n)))
      return (i: number) => (total <= 0 ? EMPTY : i < n - subDots ? HUEM : MUTED)
    }
    if (o.compact) {
      const cols = 20
      const gx = x + w - (cols - 1) * 9.6 - 6
      return g + big(x, y + 56, fig, 26, '', 14) + dots(gx, y + 42, cols, 9.6, 2, split(cols * 2)) + (caption ? t(x, y + 76, caption, { size: capSize(w), w: 500 }) : '')
    }
    const cols = Math.max(10, Math.min(25, Math.floor(w / 9.6)))
    return g + big(x, y + 62, fig, 38, '', 15) + dots(x, y + 80, cols, 9.6, 2, split(cols * 2)) + (caption ? t(x, y + 108, caption, { size: capSize(w), w: 500 }) : '')
  }

  // What the next message costs, by model; drawn only while the cache is cold, when the choice of
  // model changes the price. One scale (the cold write's top price).
  const zoneCost = (x: number, y: number, colW: number, o: { compact?: boolean } = {}) => {
    const k = o.compact
      ? { lab: 24, base: 100, rows: 6, step: 7, chip: 58, price: 88, name: 102 }
      : { lab: 24, base: 106, rows: 8, step: 8, chip: 60, price: 94, name: 110 }
    let g = t(x, y + k.lab, 'NEXT MESSAGE COSTS', { ls: 1.4 })
    const top = Math.max(...MODELS.map(m => coldCost(m, v.tokens)))
    MODELS.forEach((m, i) => {
      const mine = m.id === v.mine
      const n = top > 0 ? Math.max(1, Math.round((costOf(m, mode, v.tokens) / top) * k.rows)) : 1
      const bx = x + i * colW
      for (let r = 0; r < k.rows; r++)
        for (let c = 0; c < 3; c++)
          g += `<circle cx="${bx + 3 + c * 8}" cy="${y + k.base - r * k.step}" r="2.8" fill="${r < n ? (mine ? HUEM : MUTED) : EMPTY}"/>`
      if (mine) g += chipShapes(bx + 30, y + k.chip, 'YOU', HUEM, 10, 0.8).svg
      g += t(bx + 30, y + k.price, usd(costOf(m, mode, v.tokens)), { size: 17, w: mine ? 700 : 500, fill: mine ? TEXT : MUTED })
      g += t(bx + 30, y + k.name, m.NAME, { size: 11, w: 700, fill: mine ? HUEM : MUTED, ls: 0.8 })
    })
    return g
  }

  // What keeping the cache warm costs an hour, and what letting it go cold costs.
  const kw = keepWarmCost(v)
  const zoneKeep = (x: number, y: number, w: number) => {
    const g = t(x, y + 24, 'KEEP WARM', { ls: 1.4 })
    if (!kw) return g + t(x, y + 62, 'model not priced', { size: 16, w: 500 })
    // The break-even line only where there is room for it.
    return (
      g +
      big(x, y + 62, usd(kw.perHour), 38, '/h', 15) +
      t(x, y + 88, `going cold costs ${usd(kw.cold)}`, { size: capSize(w), w: 500 }) +
      (w >= 200 ? t(x, y + 108, `warm is cheaper if back within ${fmtBreakEven(kw.breakEvenH)}`, { size: capSize(w), w: 500 }) : '')
    )
  }

  // Per usage window, a track on one scale: the bar is the time left at this pace, the tick is the reset.
  const zonePace = (x: number, y: number, w: number) => {
    let g = t(x, y + 24, 'PACE VS RESET', { ls: 1.4 })
    const tx = x + 34
    const tw = w - 34
    if (pace.length === 0) return g + t(x, y + 62, 'no usage windows reported', { size: 12, w: 500 })
    pace.slice(0, 2).forEach((r, i) => {
      const top = y + 48 + i * 30
      g += t(x, top + 12, r.label, { size: 12, fill: r.color })
      g += `<rect x="${tx}" y="${top + 4}" width="${tw}" height="6" rx="3" fill="${EMPTY}"/>`
      if (r.pace) {
        const scale = Math.max(r.pace.lastsMs, r.pace.untilResetMs)
        const bw = Math.max(3, Math.round((r.pace.lastsMs / scale) * tw))
        g += `<rect x="${tx}" y="${top + 4}" width="${bw}" height="6" rx="3" fill="${r.pace.ok ? r.color : DANGER}"/>`
        g += `<rect x="${tx + Math.round((r.pace.untilResetMs / scale) * tw) - 1}" y="${top}" width="2" height="14" fill="${TEXT}"/>`
        g += t(tx, top - 2, `~${fmtIdle(r.pace.lastsMs)} at this pace`, { size: 10, w: 500 })
      } else {
        if (r.untilResetMs !== null) g += `<rect x="${tx + tw - 2}" y="${top}" width="2" height="14" fill="${TEXT}"/>`
        g += t(tx, top - 2, 'pace unknown', { size: 10, w: 500 })
      }
    })
    return g + t(x, y + 108, w >= 240 ? 'bar: time left at this pace · line: reset' : 'bar: time left · line: reset', { size: 10, w: 500 })
  }

  // The same two facts as text lines, for the layouts with no room for the drawing.
  const textLines = (x: number, y: number, size: number) => {
    const keep = kw ? `keep warm ${usd(kw.perHour)}/h · going cold ${usd(kw.cold)}` : 'keep warm: model not priced'
    const r = riskiest(pace)
    let paceText = 'pace unknown'
    let paceFill = MUTED
    if (r) {
      const reset = fmtIdle(r.pace.untilResetMs)
      paceText = r.pace.ok ? `${r.label} ✓ lasts until reset · resets in ${reset}` : `${r.label} runs out in ~${fmtIdle(r.pace.lastsMs)} · resets in ${reset}`
      paceFill = r.pace.ok ? TEXT : DANGER
    }
    return t(x, y, keep, { size, w: 600, fill: TEXT }) + t(x, y + size + 9, paceText, { size, w: 600, fill: paceFill })
  }

  // The first row of every layout is 124 px; the text lines under it take 54 more, the cost row 124.
  const ROW = 124
  const TEXT_ROWS = 54
  let H: number
  let g: string
  if (kind === 'wide') {
    // Four columns. IN CACHE keeps its 290 px (its dot grid), the conversation 240; the other two share the rest.
    const rest = W - 26 - 290 - 240 - 3 * 26
    const kwW = Math.floor(rest * 0.4)
    const spendX = 13 + 290 + 26
    const keepX = spendX + 240 + 26
    const paceX = keepX + kwW + 26
    const row =
      zoneSize(13, 0, 290) +
      vline(spendX - 13, 18, 88) +
      zoneSpend(spendX, 0, 240) +
      vline(keepX - 13, 18, 88) +
      zoneKeep(keepX, 0, kwW) +
      vline(paceX - 13, 18, 88) +
      zonePace(paceX, 0, W - 13 - paceX)
    if (cold) {
      H = ROW * 2
      g = row + hline(ROW) + zoneCost(13, ROW + 2, Math.min(160, (W - 26) / 4))
    } else {
      H = ROW
      g = row
    }
  } else if (kind === 'stacked') {
    const half = Math.floor(W / 2)
    const row = zoneSize(13, 0, half - 26) + vline(half, 18, 88) + zoneSpend(half + 13, 0, W - half - 26) + hline(ROW - 4) + textLines(13, ROW + 18, 13)
    const rowH = ROW + TEXT_ROWS
    if (cold) {
      H = rowH + ROW
      g = row + hline(rowH) + zoneCost(13, rowH + 2, Math.min(160, (W - 26) / 4))
    } else {
      H = rowH
      g = row
    }
  } else {
    // Narrow: the cache row above already shows Robo and the chip.
    const size = W < 300 ? 10 : 11
    const zones = zoneSize(13, 0, W - 26, { compact: true }) + hline(88) + zoneSpend(13, 88, W - 26, { compact: true }) + hline(176) + textLines(13, 198, size)
    const rowH = 176 + 46
    if (cold) {
      H = rowH + 114
      g = zones + hline(rowH) + zoneCost(13, rowH + 2, (W - 26) / 4, { compact: true })
    } else {
      H = rowH
      g = zones
    }
  }
  const h = H + CARD_TOP
  const body = `<g transform="translate(0 ${CARD_TOP})">` + hline(0) + g + '</g>'
  const alt =
    (cold
      ? `Cache cold. Idle ${v.idle}. Next message re-caches ${tok(v.tokens)} tokens.`
      : `Cache warm. Goes cold in ${Math.max(0, TTL_MIN - v.idleMin)} minutes. ${tok(v.tokens)} tokens cached.`) +
    ` ${tok(free)} of the context free.` +
    ` This conversation has cost about ${usd(total)}${total > 0 ? ` (main ${usd(mainCost)}, subagents ${usd(subsCost)})` : ''}.` +
    (kw ? ` Keeping the cache warm costs about ${usd(kw.perHour)} an hour; going cold costs ${usd(kw.cold)}.` : '')
  return { source: svgDoc(W, h, body, true), w: W, h, alt }
}
