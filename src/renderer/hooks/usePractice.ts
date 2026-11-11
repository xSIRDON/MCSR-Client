import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GapCheckFilters, GapCheckSeed } from '@shared/types'
import { ipcMessage } from '../lib/ipc-error'

export interface PracticeFilters {
  seedType: string | null
  bastionType: string | null
  maxMinutes: number | null
  minMinutes: number | null
  minRank: number | null
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
        setError('No seed matches those filters, try loosening them.')
        return
      }
      setSeeds((prev) => [seed, ...prev.filter((s) => s.matchId !== seed.matchId)].slice(0, 12))
    } catch (e) {
      setError(ipcMessage(e, 'Could not reach GapCheck.'))
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
