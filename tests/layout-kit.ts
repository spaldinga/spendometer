import { mock, test } from 'claude-code/testing'

import { shown } from './visible'

// Shared setup for the layout-*.test.ts files: the band mounted at a width with a warm cache, and the row readers.

export const NOW = Date.parse('2098-12-31T22:00:00Z')
export const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 74,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const
/** 1h 29m left of the 5h window, 18% used: the pace is known (~59% at reset). */
export const WINDOWS = [
  { kind: 'five_hour', percentUsed: 18, resetsAt: '2098-12-31T23:29:00Z' },
  { kind: 'seven_day', percentUsed: 1, resetsAt: '2099-01-02T22:00:00Z' },
] as const
/** The default: the 5h reset is further off than the window is long, so no pace shows in the row and the ladder is that of the row without it. */
export const QUIET = [{ ...WINDOWS[0], resetsAt: '2099-01-01T03:30:00Z' }, WINDOWS[1]]

/** The store of the last mountAt, for tests that read what the band wrote. */
export let lastKv = new Map<string, unknown>()

/** Set for a test that wants the old Wrap up setting in the store and a debrief command, to prove neither draws anything. */
let legacyWrap = false
/** A warm cache, both windows, a saved cost, keep-warm on. */
export const mountAt = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], columns: number, keep = true, idleMin = 22, surface: 'desktop' | 'terminal' = 'desktop', maxRows = 40, now = NOW, limits: readonly object[] = QUIET) => {
  mock.clock(on, { now })
  const kv = (lastKv = new Map<string, unknown>([['keepDefault', keep], ...(legacyWrap ? [['wrapUp', true] as [string, unknown]] : []), ['spend:S1', { main: 0.46, subs: 0.03, last: 0.03, at: NOW }]]))
  on('session.id', () => ({ value: 'S1' }))
  on('store.get', ($, e) => ({ value: kv.get(e.key) }))
  on('store.set', ($, e) => { kv.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...kv.keys()] }))
  on('store.delete', ($, e) => { kv.delete(e.key); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: limits } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('classic.SessionStart', () => ({}))
  on('command.list', () => ({ value: (legacyWrap ? ['debrief'] : []).map(name => ({ name, description: '', source: 'plugin' as const })) }))
  await $.session.start({ surface, isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleMin * 60, context_tokens: 200000, model: 'claude-opus-5-5' })
  return $.ui.mount({ plugin: 'spendometer', surface, component: 'AbovePrompt', props: { ...PROPS, bodyColumns: columns, maxRows } })
}

/** Turns the old Wrap up setting on or off for the next mounts. */
export const setLegacyWrap = (v: boolean) => { legacyWrap = v }

export const row = async (band: Awaited<ReturnType<typeof mountAt>>) => shown(await band.find({ key: 'row' }))

/** 18% used, 1h 29m left: on pace, about 26% at the reset. */
export const ON_PACE = WINDOWS
/** 60% used, 3h left (2h gone of 5): over pace, it runs out in 1h 20m. */
export const OVER_PACE = [{ kind: 'five_hour', percentUsed: 60, resetsAt: '2099-01-01T01:00:00Z' }, WINDOWS[1]]
export type Ctx = Parameters<Parameters<typeof test>[1]>
export const paced = ($: Ctx[0], on: Ctx[1], cols: number, limits: readonly object[], surface: 'desktop' | 'terminal' = 'desktop') => mountAt($, on, cols, true, 22, surface, 40, NOW, limits)
export const rowOf = async (band: Awaited<ReturnType<typeof mountAt>>) => shown((await band.find({ key: 'row' }))!)
export const tracks = async (band: Awaited<ReturnType<typeof mountAt>>) => (await band.findAll({ type: 'Svg' })).filter(s => String(s.props.alt).includes(' pace: '))
