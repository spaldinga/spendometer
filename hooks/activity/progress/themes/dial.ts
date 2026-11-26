import { EMPTY, ORANGE, TEXT } from '../../../band/look'
import type { Progress } from '../../../../types'
import { CY, FONT, anim, bar, doc, nodesOf, num, stateOf, text } from './kit'

// ---------- Pie ----------

const PIE_R = 7.5
const IDLE_SP = 52
const PIE_FULL = 17.3
/** A node: a ring with a disc (done), a clock sweeping (current), nothing (ahead); `idle` fills and clears on a timer. */
const pie = (cx: number, state: 'done' | 'cur' | 'todo' | 'idle', at = 0): string => {
  const ring = `<circle cx="${num(cx)}" cy="${CY}" r="${PIE_R}" fill="none" stroke="${state === 'done' || state === 'cur' ? ORANGE : EMPTY}" stroke-width="1.5"/>`
  if (state === 'done') return ring + `<circle cx="${num(cx)}" cy="${CY}" r="5.5" fill="${ORANGE}"/>`
  if (state === 'todo') return ring
  const sweep = (a: string) =>
    `<circle cx="${num(cx)}" cy="${CY}" r="2.75" fill="none" stroke="${ORANGE}" stroke-width="5.5" stroke-dasharray="0 ${PIE_FULL}" transform="rotate(-90 ${num(cx)} ${CY})">${a}</circle>`
  if (state === 'cur') return ring + sweep(anim('stroke-dasharray', `0 ${PIE_FULL};${PIE_FULL} 0`, '1.8s'))
  const kt = (v: number) => (v / 100).toFixed(2)
  return (
    ring +
    sweep(anim('stroke-dasharray', `0 ${PIE_FULL};0 ${PIE_FULL};${PIE_FULL} 0;${PIE_FULL} 0;0 ${PIE_FULL}`, '4.2s', `keyTimes="0;${kt(at + 1)};${kt(at + 10)};0.90;1"`))
  )
}
export const dialWalk = (p: Progress, W: number): string => {
  const { d, isCur } = stateOf(p)
  const g = nodesOf(p, W, 13, 18)
  let body = ''
  for (let i = g.lo; i < g.hi - 1; i++) {
    const from = isCur && i === d ? g.at(i) + g.L : g.at(i) + PIE_R + 2
    body += bar(from, g.at(i + 1) - PIE_R - 2, i < d ? ORANGE : EMPTY)
  }
  for (let i = g.lo; i < g.hi; i++) {
    const cx = g.at(i)
    if (i < d) body += pie(cx, 'done')
    else if (isCur && i === d) body += pie(cx, 'cur') + (g.label ? text(cx + 13, FONT, 700, TEXT, g.label) : '')
    else body += pie(cx, 'todo')
  }
  return doc(W, body)
}
const pieN = (W: number): number => Math.max(1, Math.floor((W - 16) / IDLE_SP) + 1)
export const dialPace = (W: number): string => {
  const n = pieN(W)
  let body = ''
  for (let i = 0; i < n; i++) body += pie(8 + i * IDLE_SP, 'idle', Math.floor((i * 70) / n))
  return doc(W, body)
}
