import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CREW_MAX, CREW_SHOWN, crewShown } from '../hooks/activity/crew'
import { OUT_KEEP, outputLines } from '../hooks/activity/output/lines'
import { NOW, props, engine as progressEngine, start } from './progress-kit'
import type { T$ } from './progress-kit'
import { RUN, done } from './keepwarm-kit'

type Msg = Parameters<typeof outputLines>[0][number]
const asst = (text: string, toolUses: Msg['toolUses'] = []): Msg => ({ role: 'assistant', text, toolUses })
const user = (text: string, toolResults?: Msg['toolResults']): Msg => ({ role: 'user', text, toolUses: [], ...(toolResults ? { toolResults } : {}) })
const use = (tool: string, input: Record<string, unknown>) => ({ tool_use_id: `u-${tool}`, tool, input })

test('outputLines: the prompt, the text, each tool use and nothing of the tool results', () => {
  const lines = outputLines([
    user('Find the crew code\nand report'),
    asst('Looking now.\n\nFound it.', [use('Grep', { pattern: 'crew', path: 'hooks' }), use('Bash', { description: 'List files', command: 'ls' }), use('Foo', { n: 1 })]),
    user('', [{ tool_use_id: 'u-Grep', text: 'big result', isError: false, result: 'big result' } as never]),
    asst('Done.'),
  ])
  expect(lines).toEqual(['▸ Find the crew code', 'Looking now.', 'Found it.', '→ Grep crew', '→ Bash List files', '→ Foo', 'Done.'])
})

test('outputLines: a long argument, prompt and line are cut; only the last lines are kept', () => {
  const [a, b, c] = outputLines([user('p'.repeat(150)), asst('t'.repeat(400), [use('Read', { file_path: 'f'.repeat(90) })])])
  expect(a).toBe('▸ ' + 'p'.repeat(99) + '…')
  expect(b.length).toBe(300)
  expect(b.endsWith('…')).toBe(true)
  expect(c).toBe('→ Read ' + 'f'.repeat(59) + '…')

  const many = outputLines([asst(Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n'))])
  expect(many.length).toBe(OUT_KEEP)
  expect(many[0]).toBe('line 300')
  expect(many[OUT_KEEP - 1]).toBe('line 499')
})

test('crewShown: at most CREW_SHOWN names, and fewer when their labels pass CREW_MAX characters together', () => {
  const w = (i: number, type: string, steps = 12) => ({ id: `a${i}`, type, steps, isDone: false })
  const few = crewShown([w(1, 'Explore', 4), w(2, 'Plan', 2)])
  expect(few.shown.map(x => x.id)).toEqual(['a1', 'a2'])
  expect(few.more).toBe(0)

  const many = crewShown(Array.from({ length: 8 }, (_, i) => w(i, 'x')))
  expect(many.shown.length).toBe(CREW_SHOWN)
  expect(many.more).toBe(3)

  // "sonnet-coder 12" is 15 characters: 15, then 32, and a third would make 49.
  const long = crewShown(Array.from({ length: 5 }, (_, i) => w(i, 'sonnet-coder')))
  expect(long.shown.length).toBe(2)
  expect(long.more).toBe(3)
  expect(long.shown.map(x => `${x.type} ${x.steps}`).join(', ').length).toBeLessThanOrEqual(CREW_MAX)

  // The first is always shown (its label is cut when it is shown).
  expect(crewShown([w(1, 'y'.repeat(80))]).shown.length).toBe(1)
  expect(crewShown([]).more).toBe(0)
})

const PANE = { plugin: 'spendometer', component: 'Pane', requestId: 'spendometer-output', props: { title: 'x', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const
const BAND = { plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true, 100) } as const
const SPAWN = (type: string) => ({ tool_use_id: `t-${type}`, prompt: 'p', description: 'd', subagentType: type, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false }) as never

type Opts = { messages?: Record<string, unknown>; gate?: Record<string, Promise<void>> }
/** The engine beneath: the progress kit's, plus a pane to open, subagents that spawn and the rows an agent has said. */
const engine = (on: On, o: Opts = {}) => {
  progressEngine(on)
  const opened: { id: string; title?: string }[] = []
  const sets: string[] = []
  const reads: unknown[] = []
  on('ui.open', ($, e) => { opened.push(e as never); return { value: { isPlaced: true } } })
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.subagentType}` }))
  on('session.messages', async ($, e) => { reads.push(e); await o.gate?.[String((e as { agentId?: string }).agentId)]; return { value: (o.messages ?? {})[String((e as { agentId?: string }).agentId)] ?? [] } as never })
  on('state.set', ($, e, next) => { sets.push(e.key); return next(e) })
  const writes = () => sets.filter(k => k === 'agentOut').length
  return { opened, sets, reads, writes }
}
/** Presses a Button and waits until the output has been written `n` times: the press does not wait for what it starts. */
const pressUntil = async (ui: Mounted, key: string, writes: () => number, n: number) => {
  await ui.press({ key })
  for (let i = 0; i < 100 && writes() < n; i++) await new Promise(r => setTimeout(r, 5))
}
const ROWS = [user('Look around'), asst('Reading the crew file.', [use('Read', { file_path: 'crew.ts' })])]
const step = async ($: T$, agentId: string, index: number) => {
  for await (const c of $.turn.step({ turnId: 'T1', index, model: 'claude-haiku-5-5', messageCount: 2, agentId } as never)) void c
}
type Mounted = Awaited<ReturnType<T$['ui']['mount']>>
const textOf = async (ui: Mounted) => (await ui.findAll({ type: 'Text' })).map(t => String(t.text))
test('pressing a subagent in the band opens the pane, which shows its output', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { opened, writes } = engine(on, { messages: { 'a-Explore': ROWS } })
  await start($)
  await $.agent.spawn(SPAWN('Explore'))
  await step($, 'a-Explore', 0)

  const band = await $.ui.mount(BAND)
  await pressUntil(band, 'crew-a-Explore', writes, 1)
  expect(opened).toEqual([{ id: 'spendometer-output', title: 'Explore · output' }])
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const t = await textOf(pane)
  expect(t).toContain('Explore · running')
  expect(t).toContain('▸ Look around')
  expect(t).toContain('→ Read crew.ts')
  await pane.unmount()
})

test('a subagent step refreshes the pane; the same rows a second time write nothing', async ($, on) => {
  mock.clock(on, { now: NOW })
  const rows: Record<string, unknown> = { 'a-Explore': ROWS }
  const { writes } = engine(on, { messages: rows })
  await start($)
  await $.agent.spawn(SPAWN('Explore'))
  const band = await $.ui.mount(BAND)
  await pressUntil(band, 'crew-a-Explore', writes, 1)
  expect(writes()).toBe(1)

  await step($, 'a-Explore', 0)
  expect(writes()).toBe(1)
  rows['a-Explore'] = [...ROWS, asst('One more thing.')]
  await step($, 'a-Explore', 1)
  expect(writes()).toBe(2)
  await step($, 'a-Explore', 2)
  expect(writes()).toBe(2)
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textOf(pane)).toContain('One more thing.')
  await pane.unmount()
})

test('a subagent that is not watched is not read', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { reads } = engine(on, { messages: { 'a-Explore': ROWS } })
  await start($)
  await $.agent.spawn(SPAWN('Explore'))
  await step($, 'a-Explore', 0)
  expect(reads).toEqual([])
})

test('an agent whose messages cannot be read gives the reason', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { writes } = engine(on, { messages: { 'a-Explore': { deny: 'workflow agents are not readable' } } })
  await start($)
  await $.agent.spawn(SPAWN('Explore'))
  const band = await $.ui.mount(BAND)
  await pressUntil(band, 'crew-a-Explore', writes, 1)
  await band.unmount()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textOf(pane)).toContain("This agent's output can't be read here: workflow agents are not readable")
  await pane.unmount()
})

test('a finished agent keeps its output, the header says done, and the switch row lists the recent agents', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { writes } = engine(on, { messages: { 'a-Explore': ROWS, 'a-Plan': [asst('A plan.')] } })
  await start($)
  await $.agent.spawn(SPAWN('Explore'))
  await $.agent.spawn(SPAWN('Plan'))
  const band = await $.ui.mount(BAND)
  await pressUntil(band, 'crew-a-Explore', writes, 1)
  await band.unmount()
  await done($, { usage: null, agentId: 'a-Explore' })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const t = await textOf(pane)
  expect(t).toContain('Explore · done')
  expect(t).toContain('→ Read crew.ts')
  expect(await pane.find({ key: 'out-a-Explore' })).toBeDefined()
  expect(await pane.find({ key: 'out-a-Plan' })).toBeDefined()

  await pressUntil(pane, 'out-a-Plan', writes, 2)
  expect(await textOf(pane)).toContain('Plan · running')
  expect(await textOf(pane)).toContain('A plan.')
  await pane.unmount()
})

test('the pane says what to do before anything is watched, and when there is no output yet', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { writes } = engine(on)
  await start($)
  const idle = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await textOf(idle)).toContain('Click a subagent in the band to see its output.')
  await idle.unmount()

  await $.agent.spawn(SPAWN('Explore'))
  const band = await $.ui.mount(BAND)
  await pressUntil(band, 'crew-a-Explore', writes, 1)
  await band.unmount()
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await textOf(pane)).toContain('No output yet.')
  await pane.unmount()
})

test('outputLines: a message with no text or no toolUses is skipped, the rest still shows', () => {
  const lines = outputLines([
    { role: 'assistant', toolUses: [use('Read', { file_path: 'a.ts' })] } as never,
    { role: 'assistant', text: 'Said.' } as never,
    { role: 'user' } as never,
    asst('Fine.'),
  ])
  expect(lines).toEqual(['→ Read a.ts', 'Said.', 'Fine.'])
})

test('a slow read of the agent that was left does not overwrite the one switched to', async ($, on) => {
  mock.clock(on, { now: NOW })
  let release: () => void = () => {}
  const gate = new Promise<void>(r => { release = r })
  const { writes, reads } = engine(on, { messages: { 'a-Explore': ROWS, 'a-Plan': [asst('A plan.')] }, gate: { 'a-Explore': gate } })
  await start($)
  await $.agent.spawn(SPAWN('Explore'))
  await $.agent.spawn(SPAWN('Plan'))
  const band = await $.ui.mount(BAND)
  void band.press({ key: 'crew-a-Explore' }) // its read waits on the gate
  for (let i = 0; i < 100 && reads.length < 1; i++) await new Promise(r => setTimeout(r, 5))
  await band.press({ key: 'crew-a-Plan' })
  for (let i = 0; i < 100 && writes() < 1; i++) await new Promise(r => setTimeout(r, 5))
  release()
  await new Promise(r => setTimeout(r, 50))
  await band.unmount()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const t = await textOf(pane)
  expect(t).toContain('A plan.')
  expect(t).not.toContain('→ Read crew.ts')
  await pane.unmount()
})

test('/spendometer output opens the latest subagent, or a named one, also when it has finished', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { opened } = engine(on, { messages: { 'a-Explore': ROWS, 'a-Plan': [asst('A plan.')] } })
  await start($)
  const out = async (args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
  expect(await out('output')).toContain('no subagent')
  await $.agent.spawn(SPAWN('Explore'))
  await $.agent.spawn(SPAWN('Plan'))
  await done($, { usage: null, agentId: 'a-Explore' })
  await done($, { usage: null, agentId: 'a-Plan' })

  expect(await out('output')).toContain('Plan')
  expect(opened.map(o => o.title)).toEqual(['Plan · output'])
  expect(await out('output explore')).toContain('Explore')
  expect(opened.map(o => o.title)).toEqual(['Plan · output', 'Explore · output'])
  expect(await out('output nosuch')).toContain('no subagent')
  expect(opened.length).toBe(2)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const t = await textOf(pane)
  expect(t).toContain('Explore · done')
  expect(t).toContain('→ Read crew.ts')
  await pane.unmount()
})

test('drawing the pane reads no transcript', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { reads, writes } = engine(on, { messages: { 'a-Explore': ROWS } })
  await start($)
  await $.agent.spawn(SPAWN('Explore'))
  const band = await $.ui.mount(BAND)
  await pressUntil(band, 'crew-a-Explore', writes, 1)
  await band.unmount()
  const before = reads.length
  for (let i = 0; i < 3; i++) await (await $.ui.mount({ ...PANE, surface: 'desktop' })).unmount()
  expect(reads.length).toBe(before)
})

