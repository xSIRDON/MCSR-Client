// Practice seeds come from GapCheck (gapcheck.gg): curated top-runner ranked matches published
// with their real overworld/nether/end/RNG seeds, so a seed can actually be replayed in a private
// room. MCSR Ranked's own API only exposes a seed id, which is why this isn't built on it.
// The requests run in the main process (their API sends no CORS headers) — see main/gapcheck.ts.
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GapCheckFilters, GapCheckSeed } from '@shared/types'

export interface PracticeFilters {
  /** Overworld structure code, or null for any. */
  seedType: string | null
  /** Bastion type code, or null for any. */
  bastionType: string | null
  /** Only runs finished under this many minutes. */
  maxMinutes: number | null
  /** Only runs slower than this many minutes. */
  minMinutes: number | null
  /** Only matches with a player at least this high on the leaderboard. */
  minRank: number | null
  /** Only this runner's matches (dashless uuid). */
  runnerUuid: string | null
}

export const DEFAULT_PRACTICE_FILTERS: PracticeFilters = {
  seedType: null,
  bastionType: null,
  maxMinutes: 15,
  minMinutes: null,
  minRank: 300,
  runnerUuid: null
}

/** The shape the main process takes — minutes become seconds, the runner becomes a player list. */
export function toGapCheckFilters(f: PracticeFilters): GapCheckFilters {
  return {
    seedType: f.seedType,
    bastionType: f.bastionType,
    maxTimeSeconds: f.maxMinutes ? Math.round(f.maxMinutes * 60) : null,
    minTimeSeconds: f.minMinutes ? Math.round(f.minMinutes * 60) : null,
    minRank: f.minRank,
    players: f.runnerUuid ? [f.runnerUuid] : []
  }
}

export function usePractice(filters: PracticeFilters) {
  const query = useMemo(() => toGapCheckFilters(filters), [filters])
  // Counts drive the seed-type tiles, so they follow every filter except the type itself.
  const countsKey = useMemo(() => ({ ...query, seedType: null }), [query])

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ['gapcheck-counts', countsKey],
    queryFn: () => window.mcsr.gapcheck.counts(countsKey),
    staleTime: 10 * 60_000
  })

  const [seeds, setSeeds] = useState<GapCheckSeed[]>([])
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draw = useCallback(async () => {
    setDrawing(true)
    setError(null)
    try {
      const seed = await window.mcsr.gapcheck.seed(query)
      if (!seed) {
        setError('No seed matches those filters — try loosening them.')
        return
      }
      // Drawing the same match twice is possible; show it once, newest first.
      setSeeds((prev) => [seed, ...prev.filter((s) => s.matchId !== seed.matchId)].slice(0, 12))
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : ''
      setError(msg || 'Could not reach GapCheck.')
    } finally {
      setDrawing(false)
    }
  }, [query])

  const clear = useCallback(() => {
    setSeeds([])
    setError(null)
  }, [])

  return { counts, countsLoading, seeds, draw, drawing, error, clear }
}
