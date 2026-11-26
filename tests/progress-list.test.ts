import { expect, test } from 'claude-code/testing'

import { afterListCall, afterReport, fromSteps, pulseText, ratioOf } from '../hooks/activity/progress/progress'
import { NOW, PLAN, ITEMS } from './progress-kit'
test('a whole list counts what is done and names the step in progress', () => {
  const p = afterListCall(null, PLAN, { items: ITEMS })
  expect(p).toMatchObject({ done: 1, total: 4, note: 'Write tests', hasCurrent: true, isFinished: false })
  // One done and one under way of four: the first step is done and the second is under way.
  expect(ratioOf(p!)).toBe(0.375)
})

test('advance, done and start move the list the way the plan tool does', () => {
  let p = afterListCall(null, PLAN, { items: ITEMS })
  p = afterListCall(p, PLAN, { advance: true })
  expect(p).toMatchObject({ done: 2, note: 'Write the fix' })
  p = afterListCall(p, PLAN, { done: [3], start: 4 })
  expect(p).toMatchObject({ done: 3, note: 'Run tests', isFinished: false })
  p = afterListCall(p, PLAN, { advance: true })
  expect(p).toMatchObject({ done: 4, total: 4, hasCurrent: false, isFinished: true })
  expect(ratioOf(p!)).toBe(1)
})

test("the app's wrap-up checks off what is left of the list, and makes none of its own", () => {
  const p = afterListCall(afterListCall(null, PLAN, { items: ITEMS }), 'mcp__ccd_turn__wrap_up', { recap: 'Done.' })
  expect(p).toMatchObject({ done: 4, total: 4, isFinished: true })
  expect(afterListCall(null, 'mcp__ccd_turn__wrap_up', { recap: 'Done.' })).toBe(null)
})

test('the terminal task tools build the same list', () => {
  const todo = afterListCall(null, 'TodoWrite', { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }] })
  expect(todo).toMatchObject({ done: 1, total: 2, note: 'B' })

  let p = afterListCall(null, 'TaskCreate', { subject: 'First' })
  p = afterListCall(p, 'TaskCreate', { subject: 'Second' })
  p = afterListCall(p, 'TaskUpdate', { taskId: '1', status: 'completed' })
  p = afterListCall(p, 'TaskUpdate', { taskId: '2', status: 'in_progress' })
  expect(p).toMatchObject({ done: 1, total: 2, note: 'Second' })
  // A task the list never saw changes nothing.
  expect(afterListCall(p, 'TaskUpdate', { taskId: '9', status: 'completed' })).toEqual(p)
})

test('input outside the schema cannot break the list', () => {
  const p = afterListCall(null, PLAN, { items: [null, 7, { content: 42, status: 'weird' }, { content: 'x'.repeat(500) }] })
  expect(p).toMatchObject({ done: 0, total: 2 })
  expect(p!.steps[1].title.length).toBe(80)
  expect(afterListCall(fromSteps([]), PLAN, { done: ['a', -3, 99], start: 'no' })).toMatchObject({ total: 0 })
})

test('a report keeps what it leaves out and never passes its total', () => {
  let p = afterReport(null, { total: 5, done: 2, note: 'Parsing' })
  expect(p).toMatchObject({ done: 2, total: 5, note: 'Parsing', hasCurrent: true })
  p = afterReport(p, { done: 9 })
  expect(p).toMatchObject({ done: 5, total: 5, note: 'Parsing', isFinished: true })
  expect(afterReport(afterReport(null, { total: 3, done: 1 }), { finished: true })).toMatchObject({ done: 3, isFinished: true, note: '' })
})

test('the pulse line says how many requests and how long', () => {
  expect(pulseText({ startedAt: NOW, steps: 1 }, NOW + 4000)).toBe('working · 1 step · 4s')
  expect(pulseText({ startedAt: NOW, steps: 4 }, NOW + 72000)).toBe('working · 4 steps · 1m 12s')
})
