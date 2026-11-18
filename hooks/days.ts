// The daily spend the band keeps across sessions: one number per local calendar day. Pure helpers for
// the keys; the band reads and writes the store.

/** Where a day's total lives in the store, for the whole account: `day:2026-11-18`. */
export const DAY_PREFIX = 'day:'
const DAY_MS = 24 * 60 * 60 * 1000

const two = (n: number): string => String(n).padStart(2, '0')

/** The store key of the local day `ms` falls on. */
export const dayKey = (ms: number): string => {
  const d = new Date(ms)
  return `${DAY_PREFIX}${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

/** The keys of the last `n` days, oldest first, ending with the day of `ms`. Steps by local calendar day. */
export const lastDays = (ms: number, n = 7): string[] => {
  const d = new Date(ms)
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) keys.push(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime()))
  return keys
}

/** The local noon of a `day:` key's date, or null when the key is not one. Noon keeps clock changes out of the way. */
export const dayOfKey = (key: string): number | null => {
  const m = /^day:(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : null
}

/** Whether a `day:` key is older than `days` days before `ms`. A key that does not parse is not old. */
export const isOldDay = (key: string, ms: number, days: number): boolean => {
  const at = dayOfKey(key)
  return at !== null && at < ms - days * DAY_MS
}
