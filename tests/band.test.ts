import { expect, mock, test } from 'claude-code/testing'

import { shown } from './visible'

const WINDOWS = [
  { kind: 'five_hour', percentUsed: 58, resetsAt: '2099-01-01T00:00:00Z' },
  { kind: 'seven_day', percentUsed: 12.5 },
]

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
} as const

test('the band shows percent left for each window once a reading lands', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: WINDOWS },
  }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({
      plugin: 'spendometer',
      surface,
      component: 'AbovePrompt',
      props: PROPS,
    })
    expect(await band.find({ text: '42% left' })).toBeDefined()
    expect(await band.find({ text: '87.5% left' })).toBeDefined()
    // 5H (42% left) draws before 7D (87.5% left), as /usage lists them
    const all = JSON.stringify(await band.find({ type: 'Box' }))
    expect(all.indexOf('5H')).toBeLessThan(all.indexOf('7D'))
    await band.unmount()
  }
})

test('in a narrow band the windows shrink to their percent left, with no names, dots or reset times', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: WINDOWS },
  }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({
    plugin: 'spendometer',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { ...PROPS, bodyColumns: 36 },
  })
  expect(await band.find({ text: '42% left' })).toBeDefined()
  const row = shown(await band.find({ key: 'row' }))
  expect(row).not.toContain('resets')
  expect(row).not.toContain('5H')
  expect(row).not.toContain('●')
  await band.unmount()
})

const usageSetup = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: WINDOWS } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}
/** The alt text of every drawing in the band, in order; the pace track is left out (it has its own tests). */
const pies = async (band: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) => (await band.findAll({ type: 'Svg' })).map(s => s.props.alt).filter(a => !String(a).includes(' pace: '))

test('on the desktop the wide row draws a pie per window, 5H then 7D, with the percent used', async ($, on) => {
  await usageSetup($, on)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: 100 } })
  expect(await pies(band)).toEqual(['5H 58% used', '7D 12.5% used'])
  const row = shown(await band.find({ key: 'row' }))
  expect(row).toContain('58% used')
  expect(row).toContain('12.5% used')
  expect(row).not.toContain('left')
  expect(row).not.toContain('●')
  await band.unmount()
})

test('on the desktop the compact row is the short name, a pie and the percent used; the last step drops the name', async ($, on) => {
  await usageSetup($, on)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: 45 } })
  expect(await pies(band)).toEqual(['5H 58% used', '7D 12.5% used'])
  const row = shown(await band.find({ key: 'row' }))
  expect(row).toContain('5h ')
  expect(row).toContain('58%')
  expect(row).toContain('week ')
  expect(row).toContain('12.5%')
  await band.unmount()

  const narrow = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: 25 } })
  expect(await pies(narrow)).toEqual(['5H 58% used', '7D 12.5% used'])
  const r = shown(await narrow.find({ key: 'row' }))
  expect(r).toContain('58%')
  expect(r).not.toContain('5h')
  await narrow.unmount()
})

test('the terminal keeps its text forms: dots and percent left on the wide row, no drawings', async ($, on) => {
  await usageSetup($, on)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'terminal', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: 100 } })
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  const row = shown(await band.find({ key: 'row' }))
  expect(row).toContain('42% left')
  expect(row).toContain('●')
  expect(row).not.toContain('used')
  await band.unmount()
})
