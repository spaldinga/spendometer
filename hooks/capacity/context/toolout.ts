// Tool output that entered the main conversation's context, and files read again unchanged. Pure: the
// hook in register.tsx feeds these and keeps the results.

/** How many read keys the seen-set keeps; the oldest are dropped first. */
export const SEEN_CAP = 500

/** Tokens in a tool's text as the model read it, at 4 characters a token; 0 when there is no text. */
export const tokOf = (text: unknown): number => (typeof text === 'string' && text.length > 0 ? Math.ceil(text.length / 4) : 0)

/** A path as one key: backslashes to `/`, lower case (Windows paths do not tell `C:\A\b.ts` from `c:/a/b.ts`). */
export const normPath = (path: string): string => path.replace(/\\/g, '/').toLowerCase()

/** What a read is told apart by: the path and the range, so reading another part of a file is not a re-read. */
export const readKey = (path: string, offset?: number, limit?: number): string => `${normPath(path)}|${offset ?? ''}|${limit ?? ''}`

/** Whether `key` was read before, and the seen-set with it added (kept at SEEN_CAP, oldest dropped). */
export const noteRead = (seen: readonly string[], key: string): { reread: boolean; seen: string[] } => {
  const reread = seen.includes(key)
  return { reread, seen: reread ? [...seen] : [...seen, key].slice(-SEEN_CAP) }
}

/** The seen-set without any range of `path`: after an edit, reading it again is not a re-read. */
export const dropPath = (seen: readonly string[], path: string): string[] => {
  const prefix = normPath(path) + '|'
  return seen.filter(k => !k.startsWith(prefix))
}

/** The `n` tools with the most output tokens, largest first; zero or less is left out. */
export const topTools = (byTool: Record<string, number> | undefined, n: number): [string, number][] =>
  Object.entries(byTool ?? {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
