import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { usd } from '../hooks/cost/prices'

// Shared setup for the keepwarm-*.test.ts files: the fake engine, its answers and the small readers.

/** The brown the band used to paint behind itself. */
export const BG = '#24221c'
export const NOW = Date.parse('2098-12-31T22:00:00Z')
export const MIN = 60_000
export const HOUR = 60 * MIN
export const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const
export const BAND = { plugin: 'spendometer', component: 'AbovePrompt', props: PROPS } as const
export const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

/** What a fork answers: a ping's cache figures, null (the engine sent nothing), or the whole result. */
export type Answer = { read: number; write: number } | null | { isAnswered: false; reason: 'nothing-to-fork' | 'aborted' | 'api-error'; status?: number | null; error?: string }
export const WARM: Answer = { read: 200000, write: 0 }
export const COLD: Answer = { read: 0, write: 200000 }
export const BUSY: Answer = { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit' }

export type Opts = {
  keep?: boolean
  commands?: string[]
  /** The forks' answers in order; once they run out every fork answers WARM. */
  forks?: Answer[]
  prefill?: Record<string, unknown>
  idThrows?: boolean
  registerThrows?: boolean
  /** Holds each fork until released; `forks.length` says how many were sent. */
  gate?: () => Promise<void>
}

/** The engine beneath the band: a store to inspect, the commands it lists, and what a fork answers. */
export const engine = (on: On, opts: Opts = {}) => {
  const store = new Map<string, unknown>(Object.entries(opts.prefill ?? {}))
  if (opts.keep !== undefined) store.set('keepDefault', opts.keep)
  const ran: string[] = []
  const logs: string[] = []
  const forks: number[] = []
  const session = { id: 'S1' }
  const registered: string[] = []
  const answers = [...(opts.forks ?? [])]
  on('session.id', () => { if (opts.idThrows) throw new Error('no id'); return { value: session.id } })
  on('command.register', ($, e) => { if (opts.registerThrows) throw new Error('nope'); registered.push(e.name); return { value: undefined } })
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.delete', ($, e) => { store.delete(e.key); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.compact', ($, e) => ({ messages: e.messages }))
  on('classic.SessionStart', () => ({}))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.log', ($, e) => { logs.push(e.text); return { value: undefined } })
  on('command.list', () => ({ value: (opts.commands ?? []).map(name => ({ name, description: '', source: 'plugin' as const })) }))
  on('command.run', ($, e) => { ran.push(`${e.command} ${e.args}`.trim()); return { text: '' } })
  on('model.fork', async () => {
    forks.push(forks.length)
    if (opts.gate) await opts.gate()
    const a = answers.length ? answers.shift()! : WARM
    if (a === null) return { value: null as never }
    if ('isAnswered' in a) return { value: a as never }
    return {
      value: {
        isAnswered: true as const,
        text: 'warm',
        usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: a.read, cache_creation_input_tokens: a.write },
      },
    }
  })
  return { store, ran, logs, forks, session, registered }
}

export type $ = Parameters<Parameters<typeof test>[1]>[0]

/** A session whose last main-thread request was `idleMin` minutes before the clock's now. */
export const seed = async ($: $, idleMin: number, extra: { tokens?: number; model?: string } = {}) => {
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleMin * 60, context_tokens: extra.tokens ?? 200000, model: extra.model ?? 'claude-opus-5-5' })
}

/** The typed command's answer. */
export const keepwarm = async ($: $, args: string) => ((await $.command.run({ command: 'keepwarm', args, ...RUN })) as { text: string }).text
export const settle = () => new Promise<void>(r => { (globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown }).setTimeout(r, 20) })
export const recOf = (store: Map<string, unknown>, id = 'S1') => store.get(`keep:${id}`) as { on?: boolean; deadline?: number; every?: number; at: number } | undefined
export const label = async (b: Awaited<ReturnType<$['ui']['mount']>>) => ((await b.find({ key: 'keep' })) ? '✓' : '✗')
export const submit = ($: $, text: string, origin: { kind: string } = { kind: 'composer' }) => $.prompt.submit({ text, wait: false, origin } as never)

/** Holds each fork until released. */
export function hold() {
  const releases: Array<() => void> = []
  let first = true
  return {
    gate: async () => {
      if (!first) return
      first = false
      await new Promise<void>(r => { releases.push(r) })
    },
    release: () => { for (const r of releases) r() },
  }
}

export const USED = { model: 'claude-opus-5-5', input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 2e6, cache_creation_input_tokens: 1e6 }
export const done = ($: Parameters<Parameters<typeof test>[1]>[0], extra: object) =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ reason: 'answer', answer: 'ok', durationMs: 1000, ...extra })

export const DAY = 24 * 60 * MIN
export const FRESH = (main: number, subs = 0, last = 0, at = NOW) => ({ main, subs, last, at })
export const figures = (store: Map<string, unknown>) => {
  const s = store.get('spend:S1') as { main: number; subs: number; last: number; at: number }
  expect(s.at).toBe(NOW)
  return [usd(s.main), usd(s.subs), usd(s.last)]
}

export const stored = (store: Map<string, unknown>) => store.get('spend:S1') as { main: number; subs: number; pings?: number; saved?: number }
/** The main thread's request number `index`: the engine beneath just stops. */
export const step = async ($: Parameters<Parameters<typeof test>[1]>[0], index: number) => {
  for await (const c of $.turn.step({ turnId: 'T' + index, index, model: 'claude-opus-5-5', messageCount: 4 })) void c
}
export const stopStep = (on: On) =>
  on('turn.step', async function* ($, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

