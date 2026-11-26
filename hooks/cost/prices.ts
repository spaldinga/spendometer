// The price table and what it makes of usage: list prices, what a turn cost, dollars and tokens as the
// card writes them. Pure.

import type { Mode } from '../band/look'

// $ per million tokens: input, output, and the cache read. The 1-hour cache write is 2 times
// input. Haiku 5.5 is $0.10 up to 100K tokens and $0.50 above; long sessions use the
// higher rate.
export type Model = { id: string; NAME: string; input: number; output: number; read: number }
export const MODELS: Model[] = [
  { id: 'fable', NAME: 'FABLE', input: 10, output: 50, read: 0.25 },
  { id: 'opus', NAME: 'OPUS', input: 4, output: 20, read: 0.2 },
  { id: 'sonnet', NAME: 'SONNET', input: 2, output: 10, read: 0.2 },
  { id: 'haiku', NAME: 'HAIKU', input: 0.5, output: 2.5, read: 0.05 },
]

/** Which row of MODELS a model id belongs to, or null for one the card doesn't price. */
export const familyOf = (model: string | null | undefined): string | null => {
  const m = (model ?? '').toLowerCase()
  return MODELS.find(x => m.includes(x.id))?.id ?? null
}

export const coldCost = (m: Model, tokens: number): number => (tokens / 1e6) * m.input * 2
export const warmCost = (m: Model, tokens: number): number => (tokens / 1e6) * m.read
export const costOf = (m: Model, mode: Mode, tokens: number): number => (mode === 'cold' ? coldCost(m, tokens) : warmCost(m, tokens))
/** What a turn reports having used, summed over its requests. */
export type TurnUsage = {
  model?: string | null
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * What a turn cost at list prices, or null for a model the table doesn't price.
 * An estimate, not a bill: cache writes are priced at the 1-hour rate.
 */
export const turnCost = (u: TurnUsage | null | undefined, fallbackModel?: string | null): number | null => {
  if (!u) return null
  const m = MODELS.find(x => x.id === familyOf(u.model || fallbackModel))
  if (!m) return null
  return (
    ((u.input_tokens || 0) * m.input +
      (u.output_tokens || 0) * m.output +
      (u.cache_read_input_tokens || 0) * m.read +
      (u.cache_creation_input_tokens || 0) * m.input * 2) /
    1e6
  )
}

export const usd = (n: number): string => '$' + n.toFixed(2)
export const tok = (n: number): string => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : n < 1000 ? `${Math.round(n)}` : `${Math.round(n / 1000)}k`)

/** A model as the card writes it: Opus, Sonnet. */
export const modelName = (m: Model): string => m.id[0].toUpperCase() + m.id.slice(1)
