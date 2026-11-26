// The usage windows' drawings: the pie and the 5h pace track in the band's row, the pace words and the reset time.
// Pure: each function returns an SVG string the band hands to Svg, or the words it writes.

import { DANGER, EMPTY, TEXT, svgDoc } from '../../band/look'
import type { Pace } from './pace'

// A copy of cost/cache/facts's fmtIdle: a domain imports no other domain.
/** Idle time the way the card writes it: 18m, 2h 5m, 3d 9h. */
const fmtIdle = (ms: number): string => {
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/**
 * A usage window as the pace zone draws it: its label and colour, when it resets and its pace (null while unknown),
 * the share used (0 to 100) and the window's length, which with the time to the reset gives the share of time gone.
 */
export type PaceRow = { label: string; color: string; untilResetMs: number | null; pace: Pace | null; used?: number; windowMs?: number | null }

/** What the white line in the pace strip means; the strip's hover text and part of the card's alt. */
export const PACE_TIP = "The white line is how much of the window's time has gone. A bar to the left of it is under pace, to the right is over pace."

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
