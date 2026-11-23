import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cardSvg } from '../hooks/cache-art'
import type { CacheView } from '../hooks/cache-art'
import { isCommit, isPr, resultsSentence, resultsText } from '../hooks/results'
import { resetHold, spendLine } from '../hooks/register'

const NOW = Date.parse('2098-12-31T22:00:00Z')
const WARM: CacheView = { mode: 'warm', idle: '18m', idleMin: 18, tokens: 240000, window: 1000000, mine: 'opus' }
const WIDTHS = [300, 800, 1100, 1400]
const body = (s: string) => s.slice(s.indexOf('</style>'))
const plainText = (s: string) => s.replace(/<[^>]*>/g, '')
// 63.25 over 5 results is 12.65 each.
const WITH = { main: 60, subs: 3.25, commits: 4, prs: 1 }
const WITHOUT = { main: 60, subs: 3.25 }

test('a commit is a git commit, with options in front, that is not an amend, a dry run or commit-tree', () => {
  for (const c of ['git commit -m x', 'git -c user.email=a commit -q -m x', 'git -C /r commit', 'git add . && git commit -m x', 'git commit -a -m "fix" && git commit -m "again"'])
    expect(isCommit(c)).toBe(true)
  // `echo git commit` counts: the matcher reads text, not intent. Accepted.
  expect(isCommit('echo git commit')).toBe(true)
  for (const c of ['git commit --amend', 'git commit -m x --amend --no-edit', 'git commit --dry-run', 'git log --grep commit', 'git commit-tree abc', 'git status', 'dotnet test', ''])
    expect(isCommit(c)).toBe(false)
})

test('a pull request is gh pr create or az repos pr create', () => {
  expect(isPr('gh pr create --fill')).toBe(true)
  expect(isPr('git push && gh pr create -t x')).toBe(true)
  expect(isPr('az repos pr create --title x')).toBe(true)
  for (const c of ['gh pr list', 'gh pr view 3', 'az repos pr list', 'git commit -m x'])
    expect(isPr(c)).toBe(false)
})

test('the results text leaves out a zero part and counts one in the singular', () => {
  expect(resultsText(4, 1)).toBe('4 commits · 1 PR')
  expect(resultsText(1, 2)).toBe('1 commit · 2 PRs')
  expect(resultsText(3, 0)).toBe('3 commits')
  expect(resultsText(0, 1)).toBe('1 PR')
  expect(resultsSentence(0, 0, '$1.00')).toBe('')
  expect(resultsSentence(4, 1, '$12.66')).toBe(' This conversation made 4 commits and 1 pull request, about $12.66 a result.')
})

test('the SPEND column has the results line at 1100 and 1400, and the card is no taller for it', () => {
  // Four columns are narrower than three: the shorter wording is the one that fits.
  for (const [w, line] of [[1400, '4 commits · 1 PR · $12.65 each'], [1100, '4 commits · 1 PR · ≈$12.65 a result']] as const) {
    const s = cardSvg(WARM, w, WITH)
    expect(plainText(body(s.source))).toContain(line)
  }
  for (const w of WIDTHS) expect(cardSvg(WARM, w, WITH).h).toBe(cardSvg(WARM, w, WITHOUT).h)
  expect(plainText(body(cardSvg(WARM, 1400, { ...WITH, commits: 3, prs: 0 }).source))).toContain('3 commits · ≈$21.08 a result')
})

test('no results, no line', () => {
  for (const w of WIDTHS) {
    for (const sp of [WITHOUT, { ...WITHOUT, commits: 0, prs: 0 }]) {
      const c = cardSvg(WARM, w, sp)
      expect(c.source).not.toContain('commit')
      expect(c.source).not.toContain('a result')
      expect(c.alt).not.toContain('made')
    }
  }
})

test('with a status line for SPEND (800), the results come first in it', () => {
  const s = plainText(body(cardSvg(WARM, 800, WITH).source))
  expect(s).toContain('commits')
  expect(s).toContain('≈$63.25 this thread · 4 commits · 1 PR')
})

test('the alt text and the cost answer say what the conversation made', () => {
  expect(cardSvg(WARM, 1100, WITH).alt).toContain('This conversation made 4 commits and 1 pull request, about $12.65 a result.')
  expect(spendLine(WITH)).toContain('This conversation made 4 commits and 1 pull request, about $12.65 a result.')
  expect(spendLine(WITHOUT)).not.toContain('made')
})

/** The engine beneath: a store to inspect, and what the shell call ends as. */
const engine = (on: On, deny: boolean) => {
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
  on('tool.call', () => (deny ? { deny: 'permission rules said no' } : { result: 'ran' }))
  return { record: () => store.get('spend:S1') as { commits?: number; prs?: number } | undefined }
}

test('a shell command that ran adds to the record, in Bash and PowerShell; one that did not run does not', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on, false)
  await $.tool.call({ tool: 'Bash', command: 'git -c user.email=x commit -m y' } as never)
  expect(record()).toMatchObject({ commits: 1 })
  await $.tool.call({ tool: 'PowerShell', command: 'git add .; git commit -m z; gh pr create --fill' } as never)
  expect(record()).toMatchObject({ commits: 2, prs: 1 })
  await $.tool.call({ tool: 'Bash', command: 'git status' } as never)
  expect(record()).toMatchObject({ commits: 2, prs: 1 })
})

test('a command refused beneath the hold is not counted', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { record } = engine(on, true)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m y' } as never)
  expect(record()).toBeUndefined()
})
