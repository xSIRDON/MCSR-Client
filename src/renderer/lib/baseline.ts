import splitBaseline from '@core/split-baseline.json'
import type { SplitBaselineBucket } from '@core/ranked-analytics'

type Tables = Record<string, Record<string, number[]>>
const PB = splitBaseline as unknown as {
  buckets: Record<string, SplitBaselineBucket>
  ow?: Tables
  bastion?: Tables
  stats?: Tables
  eloFor?: Record<'avg' | 'sb', [number, number][]>
  players?: number
  season?: number
}

export const BUCKETS = PB.buckets
export const WORLD_BUCKET: SplitBaselineBucket = BUCKETS.world

export const TIER_ORDER = ['coal', 'iron', 'gold', 'emerald', 'diamond', 'netherite']

export const POOL_PLAYERS = PB.players ?? null
export const POOL_SEASON = PB.season ?? null

export type CompareTo = 'world' | (typeof TIER_ORDER)[number]

export const tierName = (key: string): string => (key === 'world' ? 'All players' : key.charAt(0).toUpperCase() + key.slice(1))

export type PoolSection = 'split' | 'ow' | 'bastion' | 'stats'

export function pool(section: PoolSection, key: string, compareTo: CompareTo = 'world'): number[] | undefined {
  const t = section === 'split' ? BUCKETS : PB[section]
  return t?.[compareTo]?.[key]
}

function fractionBelow(value: number, table: number[]): number {
  const n = table.length
  if (value <= table[0]) return 0
  if (value >= table[n - 1]) return 1
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (table[mid] <= value) lo = mid
    else hi = mid
  }
  const span = table[hi] - table[lo] || 1
  return (lo + (value - table[lo]) / span) / (n - 1)
}

export function shareBeaten(
  value: number | null,
  section: PoolSection,
  key: string,
  lowerIsBetter: boolean,
  compareTo: CompareTo = 'world'
): number | null {
  const t = pool(section, key, compareTo)
  if (value == null || !t || t.length < 2) return null
  const below = fractionBelow(value, t)
  return Math.round((lowerIsBetter ? 1 - below : below) * 1000) / 1000
}

export function eloEquivalent(kind: 'avg' | 'sb', ms: number | null): number | null {
  const curve = PB.eloFor?.[kind]
  if (ms == null || !curve || curve.length < 2) return null
  if (ms <= curve[0][0]) return curve[0][1]
  const last = curve[curve.length - 1]
  if (ms >= last[0]) return last[1]
  const i = curve.findIndex(([v]) => v >= ms)
  const [v0, e0] = curve[i - 1]
  const [v1, e1] = curve[i]
  return Math.round(e0 + ((ms - v0) / (v1 - v0 || 1)) * (e1 - e0))
}

export function nextTierAbove(
  tierKey: string
): { label: string; bucket: SplitBaselineBucket } | undefined {
  const i = TIER_ORDER.indexOf(tierKey)
  if (i < 0 || i >= TIER_ORDER.length - 1) return undefined
  const next = TIER_ORDER[i + 1]
  const bucket = BUCKETS[next]
  return bucket ? { label: next.charAt(0).toUpperCase() + next.slice(1), bucket } : undefined
}
