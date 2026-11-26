import { EMPTY, ORANGE, TEXT } from '../../../band/look'
import type { Progress } from '../../../../types'
import { CY, FONT, anim, bar, doc, nodesOf, num, stateOf, text } from './kit'

// ---------- Comet + stepper ----------

const COMET_OP = [1, 0.7, 0.5, 0.35, 0.2, 0.1]
/** A comet with its head at `x`: six circles shrinking and fading behind it. */
const comet = (x: number): string =>
  COMET_OP.map((o, i) => `<circle cx="${num(x - i * 7)}" cy="${CY}" r="${4 - Math.floor(i / 2)}" fill="${ORANGE}" opacity="${o}"/>`).join('')
const DUR = '1.6s'
export const cometWalk = (p: Progress, W: number): string => {
  const { n, d, fin, isCur } = stateOf(p)
  const g = nodesOf(p, W, 12, 18)
  const cur = g.at(Math.min(d, n - 1))
  let body = ''
  if (fin) body += bar(0, W, ORANGE)
  else {
    body += bar(0, cur, ORANGE)
    body += bar(isCur ? cur + g.L : cur, W, EMPTY)
  }
  for (let i = g.lo; i < g.hi; i++) {
    const cx = num(g.at(i))
    if (i < d) body += `<circle cx="${cx}" cy="${CY}" r="5" fill="${ORANGE}"/>`
    else if (isCur && i === d) {
      body += `<circle cx="${cx}" cy="${CY}" r="5" fill="none" stroke="${ORANGE}" stroke-width="2"/>`
      body += `<circle cx="${cx}" cy="${CY}" r="5" fill="${ORANGE}" opacity="0">${anim('opacity', '0;1;0;0', DUR, 'keyTimes="0;.6;.75;1"')}</circle>`
      body += `<circle cx="${cx}" cy="${CY}" r="5" fill="none" stroke="${ORANGE}" stroke-width="1.8" opacity="0">${anim('r', '5;5;11', DUR, 'keyTimes="0;.6;1"')}${anim('opacity', '0;0;1;0', DUR, 'keyTimes="0;.59;.6;1"')}</circle>`
      if (g.label) body += text(g.at(i) + 12, FONT, 700, TEXT, g.label)
    } else body += `<circle cx="${cx}" cy="${CY}" r="4" fill="none" stroke="${EMPTY}" stroke-width="2"/>`
  }
  if (isCur) {
    const run = Math.max(0, cur - 8)
    body +=
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;${num(run)} 0;${num(run)} 0" keyTimes="0;.6;1" dur="${DUR}" repeatCount="indefinite"/>` +
      anim('opacity', '1;1;0;0', DUR, 'keyTimes="0;.6;.62;1"') +
      comet(8) +
      '</g>'
  }
  return doc(W, body)
}
export const cometPace = (W: number): string =>
  doc(
    W,
    bar(0, W, EMPTY) +
      `<g opacity="0"><animateTransform attributeName="transform" type="translate" values="0 0;${num(Math.max(0, W - 8))} 0" dur="2.2s" repeatCount="indefinite"/>` +
      anim('opacity', '0;1;1;0', '2.2s', 'keyTimes="0;.08;.85;1"') +
      comet(0) +
      '</g>',
  )
