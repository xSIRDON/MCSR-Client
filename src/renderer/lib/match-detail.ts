import type { MatchInfo } from '@services/mcsr-ranked'
import { mcsr } from './clients'

export async function matchDetail(id: number): Promise<MatchInfo> {
  const cached = (await window.mcsr.matchCache.get(id).catch(() => null)) as MatchInfo | null
  if (cached && cached.id === id && Array.isArray(cached.timelines)) return cached
  const m = await mcsr.getMatch(id)
  void window.mcsr.matchCache.put(id, m).catch(() => {})
  return m
}
