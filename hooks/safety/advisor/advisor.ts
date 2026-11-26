// The security advisor (proof of concept): reads a tool call's command line, or text that enters the context from a
// skill or a fetched page, and says what looks risky. Pure functions, no `$`. It only warns: it is a second look at
// the text, not a lock, and a command inside a script or an alias is not seen.

export type Kind = 'injection' | 'outbound' | 'upload' | 'delete'
export type Finding = { kind: Kind; detail: string }

/** Hosts that are not worth a warning: this machine, and these domains with their subdomains. */
export const KNOWN_HOSTS: readonly string[] = [
  'localhost', '127.0.0.1', '::1',
  'github.com', 'githubusercontent.com', 'dev.azure.com', 'visualstudio.com', 'nuget.org', 'npmjs.org',
  'microsoft.com', 'anthropic.com', 'claude.ai', 'claude.com',
]

const DETAIL_MAX = 80

const isKnown = (host: string): boolean => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  return KNOWN_HOSTS.some(k => h === k || h.endsWith('.' + k))
}

/** Words of one command, quotes taken off. Enough for the commands read here; not a shell parser. */
const wordsOf = (segment: string): string[] =>
  (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(w => (/^(".*"|'.*')$/.test(w) ? w.slice(1, -1) : w))

const URL_HOST = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s]*@)?(\[[^\]]+\]|[^/:?#\s]+)/i
/** `user@host:path` or `host:path` (a single letter before the colon is a Windows drive). */
const REMOTE = /^(?:[^@\s]+@)?([A-Za-z0-9][A-Za-z0-9.-]+):(?!\/\/)/

const NET = new Set(['curl', 'curl.exe', 'wget', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'scp', 'rsync', 'ssh', 'nc', 'ncat', 'ftp'])
const COPY = new Set(['scp', 'rsync'])

/** The host a network command names, or null. */
const hostOf = (head: string, args: string[]): string | null => {
  for (const a of args) {
    const m = URL_HOST.exec(a)
    if (m) return m[1]
  }
  if (COPY.has(head)) {
    for (const a of args) {
      if (a.startsWith('-')) continue
      const m = REMOTE.exec(a)
      if (m) return m[1]
    }
    return null
  }
  if (head === 'ssh' || head === 'nc' || head === 'ncat' || head === 'ftp') {
    const withUser = args.find(a => !a.startsWith('-') && a.includes('@'))
    const w = withUser ?? args.find(a => !a.startsWith('-'))
    return w ? w.replace(/^[^@]*@/, '') : null
  }
  return null
}

const isUpload = (head: string, args: string[]): boolean => {
  if (head === 'curl' || head === 'curl.exe') {
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (a === '-F' || a === '--form' || a === '-T' || a === '--upload-file') return true
      if (/^-[FT]./.test(a) || a.startsWith('--form=') || a.startsWith('--upload-file=')) return true
      if (['-d', '--data', '--data-binary', '--data-raw'].includes(a) && (args[i + 1] ?? '').startsWith('@')) return true
      if (/^(--data(-binary|-raw)?=|-d)@/.test(a)) return true
    }
    return false
  }
  if (head === 'wget') return args.some(a => a === '--post-file' || a.startsWith('--post-file='))
  if (['invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm'].includes(head)) return args.some(a => a.toLowerCase() === '-infile')
  if (COPY.has(head)) {
    const last = args[args.length - 1]
    return !!last && !last.startsWith('-') && REMOTE.test(last)
  }
  return false
}

const isDelete = (head: string, args: string[]): boolean => {
  if (head === 'rm') return args.some(a => /^-[a-zA-Z]*[rRf][a-zA-Z]*$/.test(a) || a === '--recursive' || a === '--force')
  if (head === 'rmdir' || head === 'shred') return true
  if (['remove-item', 'ri', 'del', 'rd', 'erase'].includes(head)) return args.some(a => a.toLowerCase() === '-recurse' || a.toLowerCase() === '/s')
  if (head === 'find') return args.includes('-delete')
  return false
}

/** What looks risky in a Bash or PowerShell command line: at most one finding per kind. */
export const checkCommand = (command: string): Finding[] => {
  const found = new Map<Kind, string>()
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = wordsOf(segment.trim())
    if (!words.length) continue
    const head = words[0].toLowerCase()
    const args = words.slice(1)
    if (NET.has(head)) {
      const host = hostOf(head, args)
      if (host !== null && !isKnown(host) && !found.has('outbound')) found.set('outbound', host)
      if (isUpload(head, args) && !found.has('upload')) found.set('upload', host ?? 'a remote host')
    }
    if (isDelete(head, args) && !found.has('delete')) found.set('delete', segment.trim().slice(0, DETAIL_MAX))
  }
  return [...found].map(([kind, detail]) => ({ kind, detail }))
}

const HIDDEN = /[​-‏‪-‮⁠-⁤﻿]|[\u{E0000}-\u{E007F}]/u
const PHRASES: RegExp[] = [
  /ignore (all |any )?(the )?(previous|prior|above|earlier) (instructions|prompts|rules)/i,
  /disregard (all |any )?(the )?(previous|prior|above|earlier)/i,
  /(do not|don't|never) (tell|inform|mention (this )?to|alert) the user/i,
  /without (telling|asking|informing|notifying) the user/i,
  /new (system )?instructions:/i,
]
const COMMENT = /<!--([\s\S]*?)-->/g
const COMMENT_WORDS = /instruction|ignore|assistant|claude|system prompt|you must/i

/** Text that enters the context from a skill or a fetched page: one injection finding (the first match), or none. */
export const checkText = (text: string): Finding[] => {
  // A byte order mark at the very start is how files begin, not a hidden character.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const hidden = HIDDEN.exec(body)
  if (hidden) {
    const code = hidden[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
    return [{ kind: 'injection', detail: `hidden character U+${code}` }]
  }
  for (const p of PHRASES) {
    const m = p.exec(body)
    if (m) return [{ kind: 'injection', detail: m[0].slice(0, DETAIL_MAX) }]
  }
  for (const m of body.matchAll(COMMENT)) {
    if (COMMENT_WORDS.test(m[1])) return [{ kind: 'injection', detail: `hidden comment: ${m[1].trim().slice(0, DETAIL_MAX)}` }]
  }
  return []
}

const SAYS: Record<Kind, (d: string) => string> = {
  injection: d => `text that reads like an instruction to Claude (${d})`,
  outbound: d => `outbound to unknown host ${d}`,
  upload: d => `upload to ${d}`,
  delete: d => `delete (${d})`,
}

/** One transcript line for the findings of `source`, saying it only warns. */
export const warning = (source: string, f: Finding[]): string =>
  `security advisor (POC): \`${source}\` call: ${f.map(x => SAYS[x.kind](x.detail)).join('; ')}. It runs as usual: warn only.`

const TEXT_MAX = 200_000

/** A tool result as text for checkText: a string as it is, an object as JSON, cut to the first 200 000 characters. */
export const textOf = (r: unknown): string => {
  try {
    const s = typeof r === 'string' ? r : (JSON.stringify(r) ?? '')
    return s.slice(0, TEXT_MAX)
  } catch {
    return ''
  }
}
