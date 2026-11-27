// The security advisor (proof of concept): reads a tool call's command line, or text that enters the context from a
// skill or a fetched page, and says what looks risky. Pure functions, no `$`. It only warns: it is a second look at
// the text, not a lock, and a command inside a script or an alias is not seen.

export type Kind = 'injection' | 'outbound' | 'upload' | 'delete' | 'pipe'
export type Finding = { kind: Kind; detail: string }

/** Hosts that are not worth a warning: this machine, and these domains with their subdomains. */
export const KNOWN_HOSTS: readonly string[] = [
  'localhost', '127.0.0.1', '::1',
  'github.com', 'githubusercontent.com', 'dev.azure.com', 'visualstudio.com', 'nuget.org', 'npmjs.org',
  'microsoft.com', 'anthropic.com', 'claude.ai', 'claude.com',
  'azure.com', 'login.microsoftonline.com', 'windows.net', 'aka.ms', 'npmjs.com', 'ghcr.io', 'docker.io',
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

const BUILD_DIRS = new Set(['bin', 'obj', 'node_modules', 'dist', 'build', '.cache'])
const TEMP_START = /^(\$\{?(tmpdir|temp|tmp)\}?|%(temp|tmp)%|\$env:(temp|tmp)|\/tmp|\/var\/tmp)(\/|$)/

/** A delete target that is scratch by its name: a temp folder or a build folder. Anything with `..` is not. */
const isScratch = (target: string): boolean => {
  const p = target.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  if (!p || p.split('/').includes('..') || p.includes('`') || p.includes('$(')) return false
  if (TEMP_START.test(p) || /\/appdata\/local\/temp(\/|$)/.test(p)) return true
  return BUILD_DIRS.has(p.slice(p.lastIndexOf('/') + 1))
}
const allScratch = (targets: string[]): boolean => targets.length > 0 && targets.every(isScratch)
/** Words that name something: not a flag (`-r`, `/s`). */
const targetsOf = (args: string[]): string[] => args.filter(a => !a.startsWith('-') && !/^\/[a-z]$/i.test(a))

const isDelete = (head: string, args: string[]): boolean => {
  const lower = args.map(a => a.toLowerCase())
  if (head === 'rm') {
    // Without -r only named files go, and -f only hides the questions: not worth a warning.
    if (!args.some(a => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(a) || a === '--recursive')) return false
    return !allScratch(targetsOf(args))
  }
  if (head === 'rmdir') {
    // rmdir takes empty directories only; /s and -r make it recursive.
    if (lower.includes('/s') || lower.includes('-r')) return !allScratch(targetsOf(args))
    return targetsOf(args).length > 1
  }
  if (head === 'shred') return true
  if (['remove-item', 'ri', 'del', 'rd', 'erase'].includes(head)) {
    if (!lower.includes('-recurse') && !lower.includes('/s')) return false
    return !allScratch(targetsOf(args))
  }
  if (head === 'find') return args.includes('-delete')
  return false
}

const WRAPPERS = new Set(['sudo', 'env', 'xargs', 'nohup', 'time', 'command'])
const SHELL_SINKS = new Set(['bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'iex', 'invoke-expression'])
const ASSIGN = /^[A-Za-z_]\w*=/
const baseName = (w: string): string => w.slice(Math.max(w.lastIndexOf('/'), w.lastIndexOf('\\')) + 1)

/** The words of a command with the call operator, `NAME=value`, and wrappers (`sudo`, `xargs`) and their flags taken off, and the binary named by its base name. */
const unwrap = (words: string[]): string[] => {
  let w = words
  for (let i = 0; i < 8 && w.length; i++) {
    if (w[0] === '&' || ASSIGN.test(w[0])) { w = w.slice(1); continue }
    const name = baseName(w[0]).toLowerCase().replace(/\.exe$/, '')
    if (!WRAPPERS.has(name)) break
    w = w.slice(1)
    while (w.length && (w[0].startsWith('-') || (name === 'env' && ASSIGN.test(w[0])))) w = w.slice(1)
  }
  return w.length ? [baseName(w[0]).toLowerCase().replace(/\.exe$/, ''), ...w.slice(1)] : w
}

/** Lines of a command: a line ending in `\` or a backtick joins the next, and a heredoc's body is data, so it is left out. */
const logicalLines = (command: string): string[] => {
  const out: string[] = []
  let cur = ''
  let tag: string | null = null
  for (const raw of command.split(/\r?\n/)) {
    if (tag !== null) {
      if (raw.trim() === tag) tag = null
      continue
    }
    const line = raw.trimEnd()
    const joins = /[\\`]$/.test(line)
    cur += (cur ? ' ' : '') + (joins ? line.slice(0, -1) : line)
    if (joins) continue
    out.push(cur)
    const m = /(?<!<)<<(?!<)-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_]\w*))/.exec(cur)
    if (m) tag = m[1] ?? m[2] ?? m[3]
    cur = ''
  }
  if (cur) out.push(cur)
  return out
}

type Part = { text: string; piped: boolean }

/** One line cut at `;`, `&&`, `||` and `|` outside quotes. `piped` is true after a single `|`. */
const partsOf = (line: string): Part[] => {
  const parts: Part[] = []
  let cur = ''
  let quote: string | null = null
  let piped = false
  const cut = (next: boolean) => { parts.push({ text: cur, piped }); cur = ''; piped = next }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      cur += c
      if (c === '\\' && quote === '"' && i + 1 < line.length) cur += line[++i]
      else if (c === quote) quote = null
    } else if (c === "'" || c === '"') {
      quote = c
      cur += c
    } else if (c === ';') cut(false)
    else if (c === '&' && line[i + 1] === '&') { cut(false); i++ }
    else if (c === '|') {
      const double = line[i + 1] === '|'
      cut(!double)
      if (double) i++
    } else cur += c
  }
  cut(false)
  return parts.filter(p => p.text.trim())
}

/** What looks risky in a Bash or PowerShell command line: at most one finding per kind. */
export const checkCommand = (command: string): Finding[] => {
  const found = new Map<Kind, string>()
  for (const line of logicalLines(command)) {
    let download: string | null = null // the host of a download earlier in this pipeline
    for (const part of partsOf(line)) {
      const words = unwrap(wordsOf(part.text.trim()))
      if (!words.length) continue
      const head = words[0]
      const args = words.slice(1)
      if (!part.piped) download = null
      if (part.piped && download !== null && SHELL_SINKS.has(head) && !found.has('pipe')) found.set('pipe', download)
      if (NET.has(head)) {
        const host = hostOf(head, args)
        if (host !== null && !isKnown(host) && !found.has('outbound')) found.set('outbound', host)
        if (isUpload(head, args) && !found.has('upload')) found.set('upload', host ?? 'a remote host')
        download = host ?? 'a download'
      }
      if (isDelete(head, args) && !found.has('delete')) found.set('delete', part.text.trim().slice(0, DETAIL_MAX))
    }
  }
  return [...found].map(([kind, detail]) => ({ kind, detail }))
}

// Not ZWJ, ZWNJ, LRM or RLM: emoji sequences and many scripts use them. U+2066 to U+2069 are the Trojan Source isolates.
const HIDDEN = /[​‪-‮⁠-⁤⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/u
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
  pipe: d => `a download from ${d} piped into a shell`,
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

/** How many lines of a SKILL.md are read for the check. */
export const SKILL_LINES = 2000

/** A path to a SKILL.md named in the given values (a string, or an object as JSON), or null. Only that file name is taken. */
export const skillPath = (...values: unknown[]): string | null => {
  for (const v of values) {
    // JSON escapes a backslash as two; a path in a result may come either way.
    const m = /(?:[A-Za-z]:|~|\/)[^\s"'<>|*?\n]*?SKILL\.md/.exec(textOf(v).replace(/\\\\/g, '\\'))
    if (m) return m[0]
  }
  return null
}
