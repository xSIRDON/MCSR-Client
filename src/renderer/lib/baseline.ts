import splitBaseline from '@core/split-baseline.json'
import type { SplitBaselineBucket } from '@core/ranked-analytics'

export const BUCKETS = splitBaseline.buckets as Record<string, SplitBaselineBucket>
export const WORLD_BUCKET: SplitBaselineBucket = BUCKETS.world

export const TIER_ORDER = ['coal', 'iron', 'gold', 'emerald', 'diamond', 'netherite']

export function nextTierAbove(
  tierKey: string
): { label: string; bucket: SplitBaselineBucket } | undefined {
  const i = TIER_ORDER.indexOf(tierKey)
  if (i < 0 || i >= TIER_ORDER.length - 1) return undefined
  const next = TIER_ORDER[i + 1]
  const bucket = BUCKETS[next]
  return bucket ? { label: next.charAt(0).toUpperCase() + next.slice(1), bucket } : undefined
}
