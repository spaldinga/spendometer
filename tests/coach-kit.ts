import type { On } from 'claude-code'

import { engine } from './keepwarm-kit'
import type { Opts } from './keepwarm-kit'

export { RUN, settle, submit, NOW } from './keepwarm-kit'
export type { $ } from './keepwarm-kit'

export const LONG = 'Add a retry to the upload client so a failed call is tried three times; it must not change the public API.'
export const USAGE = { input_tokens: 600, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
export const GOOD = JSON.stringify({
  parts: { goal: 'covered', why: 'missing', constraints: 'covered', done: 'missing', reuse: 'na' },
  questions: { why: 'what breaks today?', done: 'what will you check?' },
})

export type Reply = { isAnswered: true; text: string; usage: typeof USAGE } | { isAnswered: false; reason: string; usage: typeof USAGE } | 'throw'
export const said = (text: string): Reply => ({ isAnswered: true, text, usage: USAGE })

/** The fake engine plus a `model.complete` that records each call and answers from `replies` (else GOOD). */
export const coachEngine = (on: On, opts: Opts & { replies?: Reply[]; hang?: Promise<void> } = {}) => {
  const e = engine(on, opts)
  const calls: Array<{ model: string; system: string; prompt: string }> = []
  const replies = [...(opts.replies ?? [])]
  on('model.complete', async (_$, a) => {
    calls.push(a as never)
    if (opts.hang) await opts.hang
    const r = replies.length ? replies.shift()! : said(GOOD)
    if (r === 'throw') throw new Error('bad args')
    return { value: r as never }
  })
  return { ...e, calls }
}
