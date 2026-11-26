import { expect, mock, test } from 'claude-code/testing'

import { NOW, BAND, RUN, engine, seed } from './keepwarm-kit'
test('/spendometer wrapup is gone: it answers with the usage text and writes nothing', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, commands: ['debrief'], prefill: { wrapUp: true } })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
  const r = (await $.command.run({ command: 'spendometer', args: 'wrapup on', ...RUN })) as { text: string }
  expect(r.text).toContain('Usage')
  expect(r.text).not.toContain('wrapup')
  // The old key is left as it was, not written.
  expect(store.get('wrapUp')).toBe(true)
  expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
  await band.unmount()
})

test('/spendometer registers itself, reports status, and answers anything else with usage', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, registered } = engine(on, { keep: true })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(registered).toContain('spendometer')
  const text = async (args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
  const status = await text('')
  expect(status).not.toContain('wrapup')
  expect(status).toContain('hold: on')
  expect(await text('status')).toBe(status)
  await text('hold off')
  expect(store.get('hold')).toBe(false)
  expect(await text('status')).toContain('hold: off')
  await text('hold on')
  expect(store.get('hold')).toBe(true)
  const usage = await text('nonsense')
  expect(usage).toContain('Usage')
  expect(usage.includes('\n')).toBe(false)
})

test('/spendometer tab: the card tab is overview until chosen, is set and read through the command and the store, and an unknown one reads as overview', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const text = async (args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
  // Default: overview, in bold in the list and in the status; nothing stored yet.
  expect(await text('tab')).toContain('- **overview** (in use): ')
  expect(await text('status')).toContain('tab: overview')
  expect(store.has('cardTab')).toBe(false)
  expect(await text('tab cost')).toBe('tab: cost')
  expect(store.get('cardTab')).toBe('cost')
  const list = await text('tab')
  expect(list).toContain('- **cost** (in use): ')
  expect(list).toContain('- overview: ')
  expect(list).toContain('- context: ')
  expect(await text('status')).toContain('tab: cost')
  expect(await text('tab context')).toBe('tab: context')
  expect(store.get('cardTab')).toBe('context')
  // An unknown name changes nothing and shows the list; an unknown stored value reads as overview.
  expect(await text('tab nonsense')).toContain('- **context** (in use): ')
  expect(store.get('cardTab')).toBe('context')
  store.set('cardTab', 'bogus')
  expect(await text('tab')).toContain('- **overview** (in use): ')
  expect((await text('nonsense')).includes('tab [name]')).toBe(true)
})

test('a command that fails to register does not stop the rest of session start', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, registerThrows: true })
  const registered: string[] = []
  on('tool.register', ($, e) => { registered.push(e.name); return { value: { tool: `mcp__spendometer__${e.name}` } } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['progress'])
})

test('/spendometer progress lists the themes, sets one account-wide, and answers a wrong id with the list', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const text = async (args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
  expect(await text('status')).toContain('progress: comet')
  const list = await text('progress')
  expect(list).toContain('- **comet** (in use, default): a comet')
  for (const id of ['calm', 'vitals', 'bridge', 'wake', 'dial']) expect(list).toContain(`\n- ${id}: `)
  expect(store.has('progressTheme')).toBe(false)
  expect(await text('progress dial')).toBe('progress: dial')
  expect(store.get('progressTheme')).toBe('dial')
  expect(await text('status')).toContain('progress: dial')
  expect(await text('progress')).toContain('- **dial** (in use): ')
  const wrong = await text('progress nonsense')
  expect(wrong).toContain('- **dial** (in use): ')
  expect(wrong).toContain('calm')
  expect(store.get('progressTheme')).toBe('dial')
  expect(await text('nonsense')).toContain('progress [id]')
})

test('an unknown saved progress theme is the default', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, prefill: { progressTheme: 'gone' } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const text = async (args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
  expect(await text('status')).toContain('progress: comet')
  expect(await text('progress')).toContain('- **comet** (in use, default)')
})
