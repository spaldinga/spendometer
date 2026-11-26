import { EMPTY, ORANGE, svgDoc } from '../../band/look'

// The progress drawings: a row of rounded segments, one per step. Steps done are orange, the step
// in progress is orange and pulses, the rest are empty. Above MAX_MARKS steps the segments would be
// too thin, so one continuous track fills to the share done instead. With no list to measure
// against, one orange segment sweeps along a row of empty ones. Running subagents are small orange
// dots. All of it is centred in BAR_H and starts at the drawing's left edge, so a bar on a row of
// its own lines up with the row above.

/** The drawing's height: BAR_TOP px of empty space (so it never touches the buttons above it), then the 24 px the content centres in. */
export const BAR_H = 32
export const BAR_TOP = 8
/** The centre line of the content. */
export const BAR_CY = BAR_TOP + (BAR_H - BAR_TOP) / 2
const SEG_H = 6
const SEG_Y = BAR_CY - SEG_H / 2
const SEG_RX = 2
const GAP = 3
/** Above this many steps the segments would run together: one continuous track is drawn instead. */
const MAX_MARKS = 24
/** The narrowest a segment of the pacing row may be, so the row has as many as fit at this width. */
const PACE_SEG_MIN = 24
const PACE_SEGS = 7
/** The head of the continuous track: the short stretch at the fill's end that pulses. */
const HEAD_W = 8
/** A subagent's dot, and the step from one to the next. */
const DOT_R = 3.5
const DOT_STEP = 10

/** Periods in seconds: the in-progress segment's pulse, and the pacing row's sweep end to end and back. */
const PULSE_S = 1.4
const SWEEP_S = 2.4

const PULSE = `<animate attributeName="opacity" values="1;.3;1" dur="${PULSE_S}s" repeatCount="indefinite"/>`

const seg = (x: number, w: number, fill: string, inner = ''): string =>
  `<rect x="${x}" y="${SEG_Y}" width="${w}" height="${SEG_H}" rx="${SEG_RX}" fill="${fill}"` + (inner ? `>${inner}</rect>` : '/>')

/** `steps` segments across `W` pixels with GAP between them: each one's width. */
const segW = (steps: number, W: number): number => Math.max(1, (W - GAP * (steps - 1)) / steps)

/**
 * `done` of `steps` steps done, the next one in progress when `hasCurrent`, across `W` pixels. All
 * orange and still when `isFinished`.
 */
export const walkSvg = (done: number, steps: number, W: number, hasCurrent: boolean, isFinished: boolean): string => {
  const n = Math.max(1, steps)
  const d = isFinished ? n : Math.max(0, Math.min(n, done))
  let g = ''
  if (n <= MAX_MARKS) {
    const w = segW(n, W)
    for (let i = 0; i < n; i++) {
      const x = i * (w + GAP)
      const isCurrent = !isFinished && hasCurrent && i === d
      g += seg(x, w, i < d || isCurrent ? ORANGE : EMPTY, isCurrent ? PULSE : '')
    }
  } else {
    const fill = (W * d) / n
    g += seg(0, W, EMPTY)
    if (fill > 0) g += seg(0, fill, ORANGE)
    if (!isFinished && hasCurrent) {
      const x = Math.min(fill, W - HEAD_W)
      g += seg(x, HEAD_W, ORANGE, PULSE)
    }
  }
  return svgDoc(W, BAR_H, g, false)
}

/** No list, so no distance: one lit segment sweeps a row of empty ones, end to end and back. SMIL only, so the Svg needs isInteractive. */
export const paceSvg = (W: number): string => {
  const n = Math.max(1, Math.min(PACE_SEGS, Math.floor((W + GAP) / (PACE_SEG_MIN + GAP))))
  const w = segW(n, W)
  let g = ''
  for (let i = 0; i < n; i++) g += seg(i * (w + GAP), w, EMPTY)
  const span = Math.max(0, W - w)
  g += seg(
    0,
    w,
    ORANGE,
    `<animate attributeName="x" values="0;${span};0" keyTimes="0;0.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" dur="${SWEEP_S}s" repeatCount="indefinite"/>`,
  )
  return svgDoc(W, BAR_H, g, false)
}

/** The subagents at work: one small dot a head, side by side. */
export const crewSvg = (heads: number): { source: string; w: number } => {
  const n = Math.max(1, heads)
  const w = DOT_R * 2 + (n - 1) * DOT_STEP
  let g = ''
  for (let i = 0; i < n; i++) g += `<circle cx="${DOT_R + i * DOT_STEP}" cy="${BAR_CY}" r="${DOT_R}" fill="${ORANGE}"/>`
  return { source: svgDoc(w, BAR_H, g, false), w }
}
