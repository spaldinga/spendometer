import { mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Shared setup for the progress-*.test.ts files: the plan list, the band's props and the fake engine.

export const NOW = Date.parse('2098-12-31T22:00:00Z')
export const PLAN = 'mcp__ccd_turn__update_plan'
export const REPORT = 'mcp__spendometer__progress'
export const props = (isWorking: boolean, bodyColumns = 160) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 12,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
})
export const ITEMS = [
  { content: 'Read the code', status: 'completed' },
  { content: 'Write tests', status: 'in_progress' },
  { content: 'Write the fix', status: 'pending' },
  { content: 'Run tests', status: 'pending' },
]

export type T$ = Parameters<Parameters<typeof test>[1]>[0]

export const engine = (on: On) => {
  // These tests are about the segmented bar (calm); the default theme has its own test below.
  mock.store(on, { keep: true, progressTheme: 'calm' })
  const registered: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.list', () => ({ value: [] }))
  on('tool.register', ($, e) => { registered.push(e.name); return { value: { tool: `mcp__spendometer__${e.name}` } } })
  on('tool.call', () => ({ result: 'beneath' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  return { registered }
}

export const step = async ($: T$, index: number) => {
  for await (const c of $.turn.step({ turnId: 'T1', index, model: 'claude-opus-5-5', messageCount: 2 + index })) void c
}

export const start = ($: T$) => $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
