import { expect, test } from 'claude-code/testing'

import { EMPTY, LC_BL, LC_INK, LC_LA, LC_OR, LC_PE, LC_TA, LIGHT, MUTED, ORANGE, TEXT } from '../hooks/cache-art'
import { BAR_H } from '../hooks/progress-art'
import { fromSteps } from '../hooks/progress'
import { DEFAULT_THEME, THEMES, THEME_IDS, isThemeId } from '../hooks/progress-themes'
import type { ThemeId } from '../hooks/progress-themes'
import type { Progress, StepStatus } from '../types'

const light = '@media (prefers-color-scheme: light)'
const NAMES = ['Read code', 'Plan', 'Write code', 'Run tests', 'Review', 'Commit', 'Push']
const list = (done: number, names = NAMES, running = true) =>
  fromSteps(names.map((title, i) => ({ title, status: (i < done ? 'completed' : i === done && running ? 'in_progress' : 'pending') as StepStatus })))
/** Four of seven is "step 4": three done, the fourth under way. */
const RUN = list(3)
const FIN = list(7)
/** A report through the progress tool: no list, only the current step's name. */
const REPORT: Progress = { steps: [], done: 3, total: 7, note: 'Run tests', hasCurrent: true, isFinished: false }
const LONG = 'Fetch my assigned work items & read every one of their <linked> pull requests'
const W = 360
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0
const drawing = (s: string) => s.slice(s.indexOf('</style>'))
const words = (s: string) => [...s.matchAll(/<text [^>]*>(.*?)<\/text>/g)].map(m => m[1].replace(/<[^>]*>/g, ''))

/** Text and shapes that start or end outside 0..width, estimating text at 0.6 em a character (0.7 for capitals). */
const outside = (svg: string, width: number): string[] => {
  const bad: string[] = []
  const d = drawing(svg)
  for (const m of d.matchAll(/<text x="([\d.-]+)" [^>]*font-size="(\d+)"[^>]*?(text-anchor="end")?>(.*?)<\/text>/g)) {
    const raw = m[4].replace(/<[^>]*>/g, '').replace(/&amp;|&lt;|&gt;/g, '_')
    const k = raw === raw.toUpperCase() && raw.length > 2 ? 0.7 : 0.6
    const w = raw.length * Number(m[2]) * k
    const x = Number(m[1])
    const [a, b] = m[3] ? [x - w, x] : [x, x + w]
    if (a < -1 || b > width + 1) bad.push(`text "${raw}" ${a}..${b}`)
  }
  for (const m of d.matchAll(/<rect x="([\d.-]+)"[^>]*? width="([\d.]+)"/g)) {
    if (!d.includes('<clipPath') && Number(m[1]) + Number(m[2]) > width + 0.5) bad.push(`rect ${m[1]}+${m[2]}`)
  }
  return bad
}

test('the themes are the six ids, segments first and the default; anything else is not an id', () => {
  expect([...THEME_IDS]).toEqual(['segments', 'heartbeat', 'console', 'wave', 'pie', 'comet'])
  expect(DEFAULT_THEME).toBe('segments')
  expect(Object.keys(THEMES)).toEqual([...THEME_IDS])
  expect(isThemeId('pie')).toBe(true)
  expect(isThemeId('nope')).toBe(false)
  expect(isThemeId(undefined)).toBe(false)
  expect(isThemeId('constructor')).toBe(false)
  expect(THEME_IDS.filter(id => THEMES[id].names)).toEqual(['heartbeat', 'console', 'wave', 'pie', 'comet'])
})

test("segments is today's drawing", () => {
  const s = THEMES.segments.walk(RUN, 200)
  expect(count(s, /<rect /g)).toBe(7)
  expect(count(s, /<animate /g)).toBe(1)
  expect(THEMES.segments.pace(200, '')).toContain('dur="2.4s"')
})

test('heartbeat run: a complex a done step written by a pen, a beating heart and the name, dots for the steps ahead', () => {
  const s = THEMES.heartbeat.walk(RUN, W)
  expect(words(s)).toEqual(['Run tests'])
  const faint = /<path d="([^"]*)"[^>]*opacity="\.35"/.exec(s)![1]
  expect(count(faint, / q/g)).toBe(2 * 3)
  expect(s).toContain('attributeName="width"')
  expect(s).toContain('<animateTransform attributeName="transform" type="scale"')
  expect(count(s, /<circle [^>]*r="3" fill="#4a463b"/g)).toBe(3)
  expect(s).toContain('stroke-dasharray="2 5"')
  expect(s).toContain(light)
})

test('heartbeat finished: the whole trace and a heart, nothing moving', () => {
  const s = THEMES.heartbeat.walk(FIN, W)
  expect(s).not.toContain('<animate')
  expect(count(drawing(s), / q/g)).toBe(2 * 7)
  expect(words(s)).toEqual([])
})

test('heartbeat idle: the heart beats at the left and the pen writes across the row', () => {
  const s = THEMES.heartbeat.pace(W, '')
  expect(s).toContain('type="scale"')
  expect(s).toContain('dur="3.6s"')
  expect(s).toContain('clip-path="url(#pw)"')
})

test('console run: orange cap with the step, a block a step with its title, the current one wider and blinking', () => {
  const s = THEMES.console.walk(RUN, 800)
  expect(words(s)).toEqual(['STEP 04·07', 'READ CODE', 'PLAN', 'WRITE CODE', 'RUN TESTS', '04', 'REVIEW', 'COMMIT', 'PUSH'])
  // Done blocks cycle tan, peach, orange.
  const fills = [...s.matchAll(/<rect x="[\d.]+" y="4" width="([\d.]+)" height="18" fill="(#\w+)"/g)].map(m => m[2])
  expect(fills.slice(1, 4)).toEqual([LC_TA, LC_PE, LC_OR])
  expect(fills).toContain(LC_BL)
  expect(count(s, /<g opacity="\.5">/g)).toBe(3)
  expect(count(s, /calcMode="discrete"/g)).toBe(1)
  expect(s).toContain(`fill="${LC_LA}" opacity="0"`)
  expect(s).toContain(light)
})

test('console finished: every block done, no blink', () => {
  const s = THEMES.console.walk(FIN, 800)
  expect(s).not.toContain('<animate')
  expect(words(s)[0]).toBe('DONE 07·07')
  expect(count(s, /<g opacity="\.5">/g)).toBe(0)
})

test("console with no names: numbered blocks and the current step's note", () => {
  const s = THEMES.console.walk(REPORT, 560)
  expect(words(s)).toEqual(['STEP 04·07', '01', '02', '03', 'RUN TESTS', '04', '05', '06', '07'])
})

test('console shows a window around the current step when they do not fit, and a short cap when narrow', () => {
  const many = list(20, Array.from({ length: 40 }, (_, i) => `Step number ${i + 1}`))
  const s = THEMES.console.walk(many, 420)
  const w = words(s)
  expect(w[0]).toBe('STEP 21·40')
  expect(w.some(t => t.includes('STEP NUMBER 21'))).toBe(true)
  expect(w.length).toBeLessThan(15)
  expect(outside(s, 420)).toEqual([])
  expect(words(THEMES.console.walk(RUN, 300))[0]).toBe('04·07')
})

test('console idle: WORKING, the info block and blocks lighting in turn', () => {
  const s = THEMES.console.pace(560, '4 steps · 1m 12s')
  expect(words(s)).toEqual(['WORKING', '4 STEPS · 1M 12S'])
  expect(count(s, /opacity="\.25"/g)).toBeGreaterThan(5)
  expect(s).toContain('keyTimes="0;.1;.3;1"')
  expect(words(THEMES.console.pace(560, ''))).toEqual(['WORKING'])
})

test('wave run: crumbs with done muted and ticked, the current bold with a pulsing dot, a wave under, dots after', () => {
  const s = THEMES.wave.walk(RUN, 620)
  expect(words(s).filter(t => t !== '›')).toEqual(['✓ Read code', '✓ Plan', '✓ Write code', '● Run tests', 'Review', 'Commit', 'Push'])
  expect(s).toContain('font-weight="700"')
  expect(s).toContain('<tspan fill="#ff6b1a">●<animate attributeName="opacity" values="1;.3;1"')
  expect(count(s, /<animateTransform/g)).toBe(2)
  expect(s).toContain('dur="0.5s"')
  expect(s).toContain('stroke-dasharray="2 4"')
  expect(s).toContain(light)
})

test('wave windows a long list with … at the hidden ends, and no names leaves only the current crumb', () => {
  const many = list(20, Array.from({ length: 40 }, (_, i) => `Step ${i + 1}`))
  const w = words(THEMES.wave.walk(many, 360))
  expect(w[0]).toBe('… ›')
  expect(w).toContain('● Step 21')
  expect(w[w.length - 1]).toBe('…')
  expect(w.length).toBeLessThan(20)
  expect(words(THEMES.wave.walk(REPORT, 360))).toEqual(['● Run tests'])
  const bare = THEMES.wave.walk({ ...REPORT, note: '' }, 360)
  expect(words(bare)).toEqual([])
  expect(bare).toContain('stroke-dasharray')
})

test('wave finished: all ticked, the wave still', () => {
  const s = THEMES.wave.walk(FIN, 620)
  expect(s).not.toContain('<animate')
  expect(words(s).filter(t => t.startsWith('✓')).length).toBe(7)
  expect(s).not.toContain('●')
})

test('wave idle: a grey wave with an orange stretch travelling along it', () => {
  const s = THEMES.wave.pace(W, '')
  expect(s).toContain('stroke="#4a463b"')
  expect(s).toContain('attributeName="x"')
  expect(s).toContain('dur="3s"')
})

test('pie run: discs for done, a sweeping clock and the name for the current, empty rings ahead, orange connectors up to the current', () => {
  const s = THEMES.pie.walk(RUN, W)
  expect(words(s)).toEqual(['Run tests'])
  expect(count(s, /r="5.5" fill="#ff6b1a"/g)).toBe(3)
  expect(count(s, /r="7.5" fill="none" stroke="#4a463b"/g)).toBe(3)
  expect(count(s, /r="7.5" fill="none" stroke="#ff6b1a"/g)).toBe(4)
  expect(count(s, /values="0 17.3;17.3 0" dur="1.8s"/g)).toBe(1)
  const bars = [...s.matchAll(/<rect x="[\d.]+" y="12" width="[\d.]+" height="2" rx="1" fill="(#\w+)"/g)].map(m => m[1])
  expect(bars).toEqual([ORANGE, ORANGE, ORANGE, EMPTY, EMPTY, EMPTY])
  expect(s).toContain(light)
})

test('pie finished: all discs, a full orange line, nothing moving; no names: only the current is named', () => {
  const s = THEMES.pie.walk(FIN, W)
  expect(s).not.toContain('<animate')
  expect(count(s, /r="5.5"/g)).toBe(7)
  expect(count(s, /height="2" rx="1" fill="#ff6b1a"/g)).toBe(6)
  expect(words(THEMES.pie.walk(REPORT, W))).toEqual(['Run tests'])
})

test('pie idle: rings about 52 px apart filling one after another, no line', () => {
  const s = THEMES.pie.pace(300, '')
  expect(count(s, /dur="4.2s"/g)).toBe(6)
  expect(count(s, /<rect /g)).toBe(0)
  expect(s).toContain('0 17.3;0 17.3;17.3 0;17.3 0;0 17.3')
})

test('comet run: done nodes filled, a comet flying to the current node, which flashes and rings at 60% of 1.6 s, its name beside it', () => {
  const s = THEMES.comet.walk(RUN, W)
  expect(words(s)).toEqual(['Run tests'])
  expect(count(s, /r="5" fill="#ff6b1a"\/>/g)).toBe(3)
  expect(count(s, /r="4" fill="none" stroke="#4a463b"/g)).toBe(3)
  expect(s).toContain('values="0 0;')
  expect(s).toContain('keyTimes="0;.6;1" dur="1.6s"')
  expect(s).toContain('values="0;1;0;0" keyTimes="0;.6;.75;1"')
  expect(s).toContain('values="5;5;16" keyTimes="0;.6;1"')
  expect(count(s, /<circle cx="[\d.-]+" cy="13" r="[2-4]" fill="#ff6b1a" opacity="/g)).toBe(6)
  expect(s).toContain(light)
})

test('comet finished: all filled, a full line, no comet or flash', () => {
  const s = THEMES.comet.walk(FIN, W)
  expect(s).not.toContain('<animate')
  expect(count(s, /r="5" fill="#ff6b1a"/g)).toBe(7)
})

test('comet idle: the comet only flies left to right, fades and restarts', () => {
  const s = THEMES.comet.pace(W, '')
  expect(count(s, /<animateTransform/g)).toBe(1)
  expect(s).toContain(`values="0 0;${W - 8} 0"`)
  expect(s).toContain('values="0;1;1;0"')
  expect(count(drawing(s), /<circle/g)).toBe(6)
})

const ALL: ThemeId[] = [...THEME_IDS]
const NAMED = ALL.filter(i => THEMES[i].names)

test('with no names every names theme names the current step once', () => {
  for (const id of NAMED) {
    const s = THEMES[id].walk(REPORT, 560)
    expect(count(s.toLowerCase(), /run tests/g)).toBe(1)
  }
})

test('names are escaped for XML', () => {
  const p = list(1, ['Fix & tidy', 'Two <b>', 'x > y'])
  for (const id of NAMED) {
    const s = drawing(THEMES[id].walk(p, 480))
    expect(s).not.toContain('<b>')
    expect(s).not.toMatch(/& /)
  }
  expect(THEMES.pie.walk(list(0, ['A & <B>']), 300)).toContain('A &amp; &lt;B&gt;')
})

test('long names are cut with … and every drawing stays inside its width', () => {
  const names = [LONG, LONG, LONG, LONG, LONG]
  for (const width of [160, 240, 420, 700]) {
    for (const id of ALL) {
      for (const p of [list(2, names), list(5, names), list(0, names), list(2, Array.from({ length: 45 }, () => LONG))]) {
        const s = THEMES[id].walk(p, width)
        expect(outside(s, width)).toEqual([])
        expect(s).toContain(`width="${width}"`)
        expect(s).toContain(`height="${BAR_H}"`)
      }
      expect(outside(THEMES[id].pace(width, 'a very long line of words · 1h 59m'), width)).toEqual([])
    }
  }
  expect(words(THEMES.pie.walk(list(2, [LONG, LONG, LONG]), 300))[0]).toContain('…')
  expect(words(THEMES.wave.walk(list(2, [LONG, LONG, LONG]), 400)).some(t => t.includes('…'))).toBe(true)
})

test('text in a drawing is at least 11 px', () => {
  for (const id of ALL) {
    for (const s of [THEMES[id].walk(RUN, 560), THEMES[id].pace(560, '4 steps · 1m')]) {
      for (const m of s.matchAll(/font-size="(\d+)"/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(11)
    }
  }
})

test('every theme drawing carries the light style and paints only colours the light map knows', () => {
  const colours = [TEXT, MUTED, EMPTY, ORANGE, LC_OR, LC_PE, LC_TA, LC_LA, LC_BL, LC_INK]
  for (const c of colours) expect(Object.keys(LIGHT)).toContain(c)
  const seen = new Set<string>()
  for (const id of ALL) {
    const many = list(2, Array.from({ length: 40 }, (_, i) => `S${i}`))
    for (const s of [THEMES[id].walk(RUN, 560), THEMES[id].walk(FIN, 560), THEMES[id].walk(REPORT, 560), THEMES[id].walk(many, 360), THEMES[id].pace(560, '4 steps'), THEMES[id].pace(100, '')]) {
      expect(s).toContain(light)
      for (const m of drawing(s).matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)) seen.add(m[1])
    }
  }
  for (const c of seen) expect(Object.keys(LIGHT)).toContain(c)
  for (const c of [LC_OR, LC_PE, LC_TA, LC_LA, LC_BL, LC_INK]) expect(seen).toContain(c)
})

test('no animation changes a colour, which the light style could not swap', () => {
  for (const id of ALL) {
    for (const s of [THEMES[id].walk(RUN, 560), THEMES[id].pace(560, 'x')]) {
      expect(s).not.toMatch(/attributeName="(fill|stroke|stop-color)"/)
    }
  }
})
