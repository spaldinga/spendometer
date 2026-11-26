import { expect, test } from 'claude-code/testing'

import { crewSvg, paceSvg, walkSvg } from '../hooks/activity/progress/art'
const OR = '#ff6b1a'
const EM = '#4a463b'
const PULSE_RE = /<animate attributeName="opacity" values="1;\.3;1" dur="1\.4s" repeatCount="indefinite"\/>/
const rects = (s: string) => s.match(/<rect [^>]*?(?:\/>|>.*?<\/rect>)/g) ?? []
const fillOf = (r: string) => /fill="([^"]+)"/.exec(r)?.[1]
const light = '@media (prefers-color-scheme: light)'

test('walkSvg draws a segment per step: done and current orange, the rest empty, the pulse on the current one only', () => {
  const rs = rects(walkSvg(1, 4, 200, true, false))
  expect(rs.length).toBe(4)
  expect(rs.map(fillOf)).toEqual([OR, OR, EM, EM])
  expect(rs.map(r => PULSE_RE.test(r))).toEqual([false, true, false, false])
  expect(rs[0]).toContain('x="0"')
  expect(rs[0]).toContain('height="6"')
  expect(rs[0]).toContain('rx="2"')
})

test('a step list with nothing under way pulses nothing; a finished one is all orange and still', () => {
  const idle = walkSvg(2, 4, 200, false, false)
  expect(rects(idle).map(fillOf)).toEqual([OR, OR, EM, EM])
  expect(idle).not.toContain('<animate')
  const fin = walkSvg(4, 4, 200, false, true)
  expect(rects(fin).map(fillOf)).toEqual([OR, OR, OR, OR])
  expect(fin).not.toContain('<animate')
})

test('above 24 steps one continuous track fills to the share done, with the pulse on its head', () => {
  const s = walkSvg(10, 30, 300, true, false)
  const rs = rects(s)
  expect(rs.length).toBe(3)
  expect(fillOf(rs[0])).toBe(EM)
  expect(rs[0]).toContain('width="300"')
  expect(fillOf(rs[1])).toBe(OR)
  expect(rs[1]).toContain('width="100"')
  expect(PULSE_RE.test(rs[2])).toBe(true)
  expect(s.match(/<animate/g)?.length).toBe(1)
  const fin = walkSvg(30, 30, 300, false, true)
  expect(fin).not.toContain('<animate')
  expect(rects(fin).map(fillOf)).toEqual([EM, OR])
})

test('paceSvg is a row of empty segments with one orange segment sweeping end to end and back', () => {
  const s = paceSvg(300)
  const rs = rects(s)
  expect(rs.filter(r => fillOf(r) === EM).length).toBe(7)
  const lit = rs.filter(r => fillOf(r) === OR)
  expect(lit.length).toBe(1)
  expect(lit[0]).toContain('attributeName="x"')
  expect(lit[0]).toContain('dur="2.4s"')
  expect(lit[0]).toContain('repeatCount="indefinite"')
  // A narrow row has fewer, but never thinner than 24 px.
  expect(rects(paceSvg(60)).filter(r => fillOf(r) === EM).length).toBe(2)
})

test('crewSvg draws a dot a head and widens with them', () => {
  const one = crewSvg(1)
  const three = crewSvg(3)
  expect(one.source.match(/<circle/g)?.length).toBe(1)
  expect(three.source.match(/<circle/g)?.length).toBe(3)
  expect(three.source).toContain('r="3.5"')
  expect(three.w).toBeGreaterThan(one.w)
  expect(three.w - one.w).toBe(20)
})

test('every progress drawing carries the light-mode style', () => {
  for (const s of [walkSvg(1, 4, 200, true, false), walkSvg(10, 30, 300, true, false), paceSvg(200), crewSvg(2).source]) {
    expect(s).toContain(light)
  }
})
