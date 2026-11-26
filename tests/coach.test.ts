import { expect, mock, test } from 'claude-code/testing'

import { LONG, NOW, RUN, coachEngine, said, settle, submit } from './coach-kit'
import type { $ } from './coach-kit'
import { RUBRIC } from '../hooks/cost/coach/rubric'

const start = ($: $) => $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
const cmd = async ($: $, args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
const ZERO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('off by default: a first prompt makes no call', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { calls, logs } = coachEngine(on)
  await start($)
  await submit($, LONG)
  await settle()
  expect(calls.length).toBe(0)
  expect(logs.length).toBe(0)
})

test('on: the first prompt is scored once, in the fence; a second is not; /clear makes the next a first again', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { calls, store } = coachEngine(on, { prefill: { coach: true } })
  await start($)
  await submit($, LONG)
  await settle()
  expect(calls.length).toBe(1)
  expect(calls[0].model).toContain('haiku')
  expect(calls[0].system).toBe(RUBRIC)
  expect(calls[0].prompt).toContain('<brief>\n' + LONG + '\n</brief>')
  await submit($, LONG + ' And then the second thing.')
  await settle()
  expect(calls.length).toBe(1)
  await $.session.end({ sessionId: 'S1', reason: 'clear' } as never)
  await submit($, LONG)
  await settle()
  expect(calls.length).toBe(2)
  expect(store.get('coachLast')).toBe('S1')
})

test('the prompt is never held: with a call that never resolves, submit still resolves and the text goes on unchanged', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { calls } = coachEngine(on, { prefill: { coach: true }, hang: new Promise<void>(() => {}) })
  await start($)
  const r = (await submit($, LONG)) as { text?: string }
  expect(r.text).toBe(LONG)
  await settle()
  expect(calls.length).toBe(1)
})

test('a good reply logs one line with count, marks and questions, and adds one history entry', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { logs, store } = coachEngine(on, { prefill: { coach: true } })
  await start($)
  await submit($, LONG)
  await settle()
  expect(logs.length).toBe(1)
  expect(logs[0]).toContain('brief coach: 2 of 4 parts')
  expect(logs[0]).toContain('goal ✓ why ✗ constraints ✓ done when ✗')
  expect(logs[0]).not.toContain('what to reuse')
  expect(logs[0]).toContain('Haiku $0.000')
  expect(logs[0]).toContain('Why: what breaks today? Done when: what will you check?')
  const h = store.get('coachHistory') as Array<{ applicable: number; covered: number; usd: number | null }>
  expect(h.length).toBe(1)
  expect(h[0]).toMatchObject({ applicable: 4, covered: 2 })
  expect(h[0].usd).not.toBeNull()
})

test('fails open: a throw, an unanswered reply and junk each log nothing and count as not scored', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { logs, store } = coachEngine(on, {
    prefill: { coach: true },
    replies: ['throw', { isAnswered: false, reason: 'timeout', usage: ZERO }, said('no idea')],
  })
  await start($)
  for (let i = 0; i < 3; i++) {
    await $.session.end({ sessionId: 'S1', reason: 'clear' } as never)
    await submit($, LONG)
    await settle()
  }
  expect(logs.length).toBe(0)
  expect(store.get('coachFails')).toBe(3)
  expect(store.get('coachHistory')).toBeUndefined()
})

test('skips a command, a plugin prompt and a short go-ahead; the next long prompt is still the first', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { calls } = coachEngine(on, { prefill: { coach: true } })
  await start($)
  await submit($, '/spendometer status and then a lot more words to be long enough')
  await submit($, LONG, { kind: 'plugin' })
  await submit($, 'kör')
  await settle()
  expect(calls.length).toBe(0)
  await submit($, LONG)
  await settle()
  expect(calls.length).toBe(1)
})

test('all parts n/a: no line and no history', async ($, on) => {
  mock.clock(on, { now: NOW })
  const na = JSON.stringify({ parts: { goal: 'na', why: 'na', constraints: 'na', done: 'na', reuse: 'na' } })
  const { logs, store } = coachEngine(on, { prefill: { coach: true }, replies: [said(na)] })
  await start($)
  await submit($, LONG)
  await settle()
  expect(logs.length).toBe(0)
  expect(store.get('coachHistory')).toBeUndefined()
})

test('/spendometer coach on|off|status and the overview line', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = coachEngine(on)
  await start($)
  expect(await cmd($, 'coach status')).toBe('coach: off · nothing scored yet')
  expect(await cmd($, 'coach on')).toBe('coach: on')
  expect(store.get('coach')).toBe(true)
  expect(await cmd($, '')).toContain('coach: on · nothing scored yet')
  expect(await cmd($, 'coach off')).toBe('coach: off')
  expect(store.get('coach')).toBe(false)
  expect(await cmd($, 'nonsense')).toContain('coach on|off|status')
})
