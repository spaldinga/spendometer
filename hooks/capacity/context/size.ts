// The size of the main conversation's context: which tool output entered it, and the set of reads that tells a
// re-read from a first read. The measuring returns what it found; recording it in the Spent record is cost/spend's
// job (register.tsx passes one to the other). A hook's `$` is followed past an import only into function declarations.

import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { dropPath, noteRead, readKey, tokOf } from './toolout'

/** Read keys (path and range) the main thread read and has not edited since: a second read of one is a re-read. Lost on a reload. */
const seen = atom({ plugin: 'spendometer', key: 'seen' } as const, [] as string[])

/** Forgets every read key: after a new conversation or a compaction, reading a file again is legitimate. */
export async function clearSeen($: EngineInterface): Promise<void> {
  await update($, seen, () => [])
}

/** True for a hook result that refused the call. */
export function isDeny(r: unknown): boolean {
  return !!r && typeof r === 'object' && 'deny' in r
}

/** What one finished call put in the main context. */
export type Measured = { tool: string; tokens: number; reread: boolean }

/**
 * Counts a finished call's output in the main context: the size of the text the model read, by tool name.
 * Subagent calls are left out (their output never enters the main context), and so are refused ones: null.
 * A Read of a range already read and not edited since is a re-read; an errored Read is not recorded as seen.
 */
export async function measureCall($: EngineInterface, tool: string, e: unknown, r: unknown): Promise<Measured | null> {
  try {
    const a = e as { agentId?: string; file_path?: unknown; offset?: unknown; limit?: unknown }
    if (a.agentId || isDeny(r)) return null
    const res = r as { text?: unknown; isError?: unknown } | null | undefined
    const tokens = tokOf(res?.text)
    let reread = false
    if (tool === 'Read' && typeof a.file_path === 'string' && !res?.isError) {
      const key = readKey(a.file_path, typeof a.offset === 'number' ? a.offset : undefined, typeof a.limit === 'number' ? a.limit : undefined)
      await update($, seen, s => {
        const n = noteRead(s, key)
        reread = n.reread
        return n.seen
      })
    }
    return { tool, tokens, reread }
  } catch { /* the figure misses this call */ }
  return null
}

/** Forgets the reads of a file the main thread just changed. */
export async function forgetPath($: EngineInterface, e: unknown, r: unknown): Promise<void> {
  try {
    const a = e as { agentId?: string; file_path?: unknown; notebook_path?: unknown }
    const path = typeof a.file_path === 'string' ? a.file_path : typeof a.notebook_path === 'string' ? a.notebook_path : null
    // A subagent's edit changes the file for the main thread too, so it counts here, unlike its output.
    if (path !== null && !isDeny(r)) await update($, seen, s => dropPath(s, path))
  } catch { /* a re-read may then be counted that was not one */ }
}
