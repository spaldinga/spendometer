import { expect, test } from 'claude-code/testing'

import { SEEN_CAP, baseName, dropPath, noteRead, normPath, readKey, tokOf, topTools } from '../hooks/capacity/context/toolout'

test('tokens are a quarter of the characters, rounded up, and 0 without text', () => {
  expect(tokOf('abcd')).toBe(1)
  expect(tokOf('abcde')).toBe(2)
  expect(tokOf('')).toBe(0)
  expect(tokOf(undefined)).toBe(0)
  expect(tokOf(42)).toBe(0)
})

test('a path is the same key in Windows and Unix spelling, any case', () => {
  expect(normPath('C:\\A\\b.ts')).toBe(normPath('c:/a/b.ts'))
  expect(readKey('C:\\A\\b.ts')).toBe(readKey('c:/a/b.ts'))
})

test('a second read of the same range is a re-read; another range is not', () => {
  const a = noteRead([], readKey('/x/a.ts'))
  expect(a.reread).toBe(false)
  const b = noteRead(a.seen, readKey('/x/a.ts'))
  expect(b.reread).toBe(true)
  const c = noteRead(b.seen, readKey('/x/a.ts', 100, 50))
  expect(c.reread).toBe(false)
  expect(noteRead(c.seen, readKey('/x/a.ts', 100, 50)).reread).toBe(true)
  expect(noteRead(c.seen, readKey('/x/b.ts')).reread).toBe(false)
})

test('an edit drops every range of that path and no other', () => {
  let seen: string[] = []
  for (const k of [readKey('/x/a.ts'), readKey('/x/a.ts', 1, 5), readKey('/x/ab.ts'), readKey('/x/b.ts')]) seen = noteRead(seen, k).seen
  const after = dropPath(seen, '\\X\\A.ts')
  expect(after).toEqual([readKey('/x/ab.ts'), readKey('/x/b.ts')])
  expect(noteRead(after, readKey('/x/a.ts')).reread).toBe(false)
})

test('the seen-set is capped and the oldest go first', () => {
  let seen: string[] = []
  for (let i = 0; i < SEEN_CAP + 10; i++) seen = noteRead(seen, readKey(`/f/${i}`)).seen
  expect(seen.length).toBe(SEEN_CAP)
  expect(noteRead(seen, readKey('/f/0')).reread).toBe(false)
  expect(noteRead(seen, readKey(`/f/${SEEN_CAP + 9}`)).reread).toBe(true)
})

test('the top tools are the largest first, zero and below left out', () => {
  expect(topTools({ Grep: 6, Bash: 18, Read: 12, Glob: 0, Web: -3 }, 3)).toEqual([['Bash', 18], ['Read', 12], ['Grep', 6]])
  expect(topTools({ Grep: 6, Bash: 18, Read: 12 }, 2)).toEqual([['Bash', 18], ['Read', 12]])
  expect(topTools(undefined, 3)).toEqual([])
})

test('a basename is the last part of a path in either spelling', () => {
  expect(baseName('C:\\r\\sub\\Card.ts')).toBe('Card.ts')
  expect(baseName('/r/sub/card.ts')).toBe('card.ts')
  expect(baseName('card.ts')).toBe('card.ts')
  expect(baseName('/r/mixed\\path/x.md')).toBe('x.md')
})
