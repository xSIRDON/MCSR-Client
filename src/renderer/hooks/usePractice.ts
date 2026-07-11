// Practice seeds: a top runner's fastest recent completed seeds, each with their splits, so you
// can replay the seed (private room → Set Seed) and see your gap. Seed detail (structure + splits)
// comes from the match-detail endpoint, cached forever since a played match never changes.
import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { mcsr } from '../lib/clients'
import { analyzeSplits } from '@core/ranked-analytics'
import type { SplitStat } from '@core/ranked-analytics'

export interface PracticeSeed {
  matchId: number
  seedId: string | null
  overworld: string | null
  nether: string | null
  endTowers: number[]
  date: number | null
  /** The runner's completion time on this seed (ms). */
  finishMs: number | null
  /** The runner's splits on this seed — your targets. */
  splits: SplitStat[]
}

/** How many of the runner's fastest recent seeds to surface. */
const MAX_SEEDS = 6

export function usePractice(runnerUuid: string | null | undefined) {
  const enabled = !!runnerUuid
  const uuid = (runnerUuid ?? '').toLowerCase()

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ['practice-matches', uuid],
    queryFn: () => mcsr.getMatches(runnerUuid!, { type: 2, count: 50 }),
    enabled
  })

  // Their fastest recent wins that actually completed — a forfeit time isn't a run.
  const winIds = useMemo(() => {
    return (matches ?? [])
      .filter(
        (m) =>
          m.type === 2 &&
          !m.forfeited &&
          m.result?.uuid?.toLowerCase() === uuid &&
          typeof m.result?.time === 'number' &&
          m.result.time > 0
      )
      .sort((a, b) => (a.result!.time as number) - (b.result!.time as number))
      .slice(0, MAX_SEEDS)
      .map((m) => m.id)
  }, [matches, uuid])

  const details = useQueries({
    queries: winIds.map((id) => ({
      queryKey: ['match-detail', id],
      queryFn: () => mcsr.getMatch(id),
      enabled,
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnMount: false
    }))
  })

  const seeds = useMemo<PracticeSeed[]>(() => {
    const out: PracticeSeed[] = []
    for (const q of details) {
      const m = q.data
      if (!m) continue
      const finish =
        m.completions?.find((c) => c.uuid.toLowerCase() === uuid)?.time ?? m.result?.time ?? null
      out.push({
        matchId: m.id,
        seedId: m.seed?.id ?? null,
        overworld: m.seed?.overworld ?? m.seedType ?? null,
        nether: m.seed?.nether ?? m.bastionType ?? null,
        endTowers: Array.isArray(m.seed?.endTowers) ? (m.seed!.endTowers as number[]) : [],
        date: m.date ?? null,
        finishMs: finish,
        splits: analyzeSplits(uuid, [m])
      })
    }
    return out.sort((a, b) => (a.finishMs ?? Infinity) - (b.finishMs ?? Infinity))
  }, [details, uuid])

  const detailsLoading = winIds.length > 0 && details.some((d) => d.isLoading && !d.data)

  return {
    seeds,
    loading: enabled && (matchesLoading || detailsLoading),
    /** The runner has no qualifying completed seeds to practice. */
    empty: enabled && !matchesLoading && winIds.length === 0
  }
}
