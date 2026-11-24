import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { resetHold } from '../hooks/register'

const NOW = Date.parse('2098-12-31T22:00:00Z')

type Rec = { byTool?: Record<string, number>; rereads?: number; rereadTok?: number }

/** The engine beneath: a store to inspect, and a tool stub that answers with `text` (4 characters a token) or refuses. */
const engine = (on: On, o: { deny?: boolean; text?: string; isError?: boolean } = {}) => {
  resetHold()
  const store = new Map<string, unknown>([['keep', true]])
  on('session.id', () => ({ value: 'S1' }))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/work' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  on('command.list', () => ({ value: [] }))
  on('tool.call', () => (o.deny ? { deny: 'no' } : { result: 'x', text: o.text ?? 'x'.repeat(40), ...(o.isError ? { isError: true } : {}) }))
  return { record: () => store.get('spend:S1') as Rec | undefined }
}

test('a main-thread Read twice is one re-read, and both reads count as Read output', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\r\\a.ts' } as never)
  expect(record()).toMatchObject({ byTool: { Read: 10 } })
  expect(record()?.rereads).toBeUndefined()
  await $.tool.call({ tool: 'Read', file_path: 'c:/r/a.ts' } as never)
  expect(record()).toMatchObject({ byTool: { Read: 20 }, rereads: 1, rereadTok: 10 })
  // Another range of the same file is not a re-read.
  await $.tool.call({ tool: 'Read', file_path: 'c:/r/a.ts', offset: 50, limit: 20 } as never)
  expect(record()).toMatchObject({ byTool: { Read: 30 }, rereads: 1 })
})

test('Read, Edit, Read is no re-read; Write and NotebookEdit also reset the file, and their output counts', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on)
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/r/a.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts' } as never)
  expect(record()?.rereads).toBeUndefined()
  expect(record()).toMatchObject({ byTool: { Read: 20, Edit: 10 } })
  await $.tool.call({ tool: 'Write', file_path: '/r/a.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts' } as never)
  expect(record()?.rereads).toBeUndefined()
  await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/r/a.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts' } as never)
  expect(record()?.rereads).toBeUndefined()
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts' } as never)
  expect(record()?.rereads).toBe(1)
})

test('a call in a subagent records nothing', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on)
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts', agentId: 'sub1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub1' } as never)
  expect(record()).toBeUndefined()
})

test('a refused call records nothing, and does not reset a file', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on, { deny: true })
  for (const call of [{ tool: 'Read', file_path: '/r/a.ts' }, { tool: 'Grep', pattern: 'x' }, { tool: 'Bash', command: 'ls' }, { tool: 'Edit', file_path: '/r/a.ts' }])
    await $.tool.call(call as never)
  expect(record()).toBeUndefined()
})

test('an errored Read counts its text but is not recorded as seen', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on, { isError: true })
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts' } as never)
  expect(record()).toMatchObject({ byTool: { Read: 20 } })
  expect(record()?.rereads).toBeUndefined()
})

test('shell output is counted by tool name beside the commit count, and Grep, Glob and the web tools by theirs', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)
  await $.tool.call({ tool: 'PowerShell', command: 'dir' } as never)
  for (const tool of ['Grep', 'Glob', 'WebFetch', 'WebSearch']) await $.tool.call({ tool } as never)
  expect(record()).toMatchObject({ byTool: { Bash: 10, PowerShell: 10, Grep: 10, Glob: 10, WebFetch: 10, WebSearch: 10 }, commits: 1 })
})

test('a result with no text adds nothing', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on, { text: '' })
  await $.tool.call({ tool: 'Grep' } as never)
  expect(record()).toBeUndefined()
})
