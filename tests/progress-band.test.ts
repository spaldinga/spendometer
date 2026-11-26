import { expect, mock, test } from 'claude-code/testing'

import { NOW, PLAN, REPORT, props, ITEMS, engine, step, start } from './progress-kit'
test('the desktop band draws the segmented bar from the task list, and lets the call through', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await step($, 0)
  expect(await $.tool.call({ tool: PLAN, items: ITEMS } as never)).toMatchObject({ result: 'beneath' })

  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  const bar = (await band.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Progress'))
  expect(bar?.props.alt).toBe('Progress: 1 of 4 done. Now: Write tests')
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  expect(await band.find({ text: ' · Write tests' })).toBeDefined()

  await $.tool.call({ tool: PLAN, advance: true } as never)
  expect(await band.find({ text: ' 2/4' })).toBeDefined()
  expect(await band.find({ text: ' · Write the fix' })).toBeDefined()
  await band.unmount()
})

test('the terminal draws the bar as text', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: ITEMS } as never)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'terminal', component: 'AbovePrompt', props: props(true, 100) })
  expect(await band.find({ text: /^[▰▱]+$/ })).toBeDefined()
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  await band.unmount()
})

test("the mod's own tool reports progress, for the main session only", async ($, on) => {
  mock.clock(on, { now: NOW })
  const { registered } = engine(on)
  await start($)
  expect(registered).toEqual(['progress'])
  expect(await $.tool.call({ tool: REPORT, total: 5, done: 2, note: 'Parsing' } as never)).toMatchObject({ result: 'ok: 2/5' })
  const sub = { tool: REPORT, total: 9, done: 9, agentId: 'sub1' }
  expect(await $.tool.call(sub as never)).toMatchObject({ result: 'ignored: only the main session reports progress' })

  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  expect(await band.find({ text: ' 2/5' })).toBeDefined()
  await band.unmount()
})

test('a subagent keeping its own list does not move the bar', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: ITEMS } as never)
  const sub = { tool: 'TodoWrite', todos: [{ content: 'Sub', status: 'completed' }], agentId: 'sub1' }
  await $.tool.call(sub as never)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  await band.unmount()
})

test('with no list, a working turn shows the sweeping segment with steps and time; an idle one shows nothing', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await step($, 0)
  await clock.advance(72000)
  await step($, 1)

  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  const alts = (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts).toContain('Working')
  expect(await band.find({ text: ' working · 2 steps · 1m 12s' })).toBeDefined()
  await band.unmount()

  const idle = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  expect((await idle.findAll({ type: 'Svg' })).map(s => String(s.props.alt))).not.toContain('Working')
  expect(await idle.find({ text: / working · / })).toBeUndefined()
  await idle.unmount()
})

test('a finished list stays until the next request starts, then clears', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await step($, 0)
  await $.tool.call({ tool: PLAN, items: ITEMS.map(i => ({ ...i, status: 'completed' })) } as never)

  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  expect(await band.find({ text: ' 4/4' })).toBeDefined()
  expect(await band.find({ text: ' · done' })).toBeDefined()

  await step($, 0)
  expect(await band.find({ text: ' 4/4' })).toBeUndefined()
  await band.unmount()
})

test('a narrow band gives the bar a row of its own', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: ITEMS } as never)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true, 60) })
  expect(await band.find({ key: 'progress-row' })).toBeDefined()
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  await band.unmount()
})

const spawn = (type: string) =>
  ({ tool_use_id: `t-${type}`, prompt: 'p', description: `${type} work`, subagentType: type, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false })

const subStep = async ($: T$, agentId: string, index: number) => {
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: `sub-${agentId}`, index, model: 'claude-sonnet-5-5', messageCount: 1, agentId })
  for await (const c of stream) void c
}

test('running subagents stand beside the bar with their kind and requests, and leave when done', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.subagentType}` }))
  await start($)
  await step($, 0)
  await $.agent.spawn(spawn('Explore') as never)
  await $.agent.spawn(spawn('sonnet-coder') as never)
  await subStep($, 'a-Explore', 0)
  await subStep($, 'a-Explore', 1)
  await subStep($, 'a-sonnet-coder', 0)

  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  const alts = async () => (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(await alts()).toContain('2 subagents working')
  expect(await band.find({ text: ' ×2' })).toBeDefined()
  // The names are buttons (a press opens the subagent's output).
  expect((await band.find({ key: 'crew-a-Explore' }))?.props.label).toBe('Explore 2')
  expect((await band.find({ key: 'crew-a-sonnet-coder' }))?.props.label).toBe('sonnet-coder 1')

  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a-Explore', reason: 'answer', answer: 'ok', usage: null, durationMs: 10 })
  expect(await alts()).toContain('1 subagent working')
  expect(await band.find({ key: 'crew-a-Explore' })).toBeUndefined()
  expect((await band.find({ key: 'crew-a-sonnet-coder' }))?.props.label).toBe('sonnet-coder 1')
  await band.unmount()
})

test('a background subagent still shows after the main turn has stopped working', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.subagentType}` }))
  await start($)
  await $.agent.spawn(spawn('Explore') as never)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'terminal', component: 'AbovePrompt', props: props(false, 100) })
  expect(await band.find({ text: ' ×1' })).toBeDefined()
  expect((await band.find({ key: 'crew-a-Explore' }))?.props.label).toBe('Explore 0')
  await band.unmount()
})

test('on the desktop, a background subagent after the main turn has ended keeps the working bar beside it, with no turn time', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.subagentType}` }))
  await start($)
  await $.agent.spawn(spawn('sonnet-coder') as never)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  const alts = (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts).toContain('Working')
  expect(alts).toContain('1 subagent working')
  expect(await band.find({ text: ' ×1' })).toBeDefined()
  expect(await band.find({ text: /working ·/ })).toBeUndefined()
  await band.unmount()
})

test('with nothing working and no subagents, there is no bar', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  expect(await band.find({ key: 'bar' })).toBeUndefined()
  await band.unmount()
})
