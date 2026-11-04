import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mcsr } from '../lib/clients'
import {
  analyzeRanked,
  buildScorecard,
  countDeaths,
  playerSegments,
  speedFromPerf,
  splitPerformance
} from '@core/ranked-analytics'
import { rankedStats } from '@services/mcsr-ranked'
import type { MatchInfo } from '@services/mcsr-ranked'
import { eloToRank } from '@core/rank'
import { WORLD_BUCKET } from '../lib/baseline'

export interface HeadStats {
  wins: number
  losses: number
  played: number
  bestTime: number | null
  currentStreak: number
  bestStreak: number
  elo: number | null
  netElo: number
  averageWin: number | null
}

export function useCurrentSeason(): number | undefined {
  const { data } = useQuery({
    queryKey: ['season-meta'],
    queryFn: () => mcsr.getLeaderboard(),
    staleTime: 60 * 60 * 1000
  })
  return data?.season?.number
}

export type SeasonSel = number | 'all' | undefined

export function usePlayerAnalytics(uuid: string | null | undefined, season?: SeasonSel) {
  const enabled = !!uuid
  const seasonNum = typeof season === 'number' ? season : undefined
  const { data: user } = useQuery({
    queryKey: seasonNum != null ? ['user', uuid, seasonNum] : ['user', uuid],
    queryFn: () => mcsr.getUser(uuid!, { season: seasonNum }),
    enabled
  })
  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: seasonNum != null ? ['review-matches', uuid, seasonNum] : ['review-matches', uuid],
    queryFn: () => mcsr.getMatches(uuid!, { type: 2, count: 100, season: seasonNum }),
    enabled
  })

  const scope: 'season' | 'total' = season === 'all' ? 'total' : 'season'
  const seasonStats = useMemo(() => rankedStats(user, scope), [user, scope])
  const seasonDecided = seasonStats.wins + seasonStats.loses
  const seasonWinRate =
    seasonDecided > 0 ? Math.round((seasonStats.wins / seasonDecided) * 1000) / 10 : null

  const analytics = useMemo(
    () =>
      analyzeRanked(uuid ?? '', matches ?? [], {
        winRate: seasonWinRate,
        forfeitRate: seasonStats.forfeitRate,
        played: seasonStats.played
      }),
    [uuid, matches, seasonWinRate, seasonStats.forfeitRate, seasonStats.played]
  )

  const detailIds = useMemo(
    () =>
      (matches ?? [])
        .filter((m) => m.type === 2)
        .slice(0, 50)
        .map((m) => m.id),
    [matches]
  )
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ['review-splits', uuid, seasonNum ?? 'current', detailIds],
    queryFn: async () => {
      const out: MatchInfo[] = []
      for (const id of detailIds) {
        try {
          out.push(await mcsr.getMatch(id))
        } catch {
        }
      }
      return out
    },
    enabled: enabled && detailIds.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false
  })

  const elo =
    seasonNum != null ? (user?.seasonResult?.last?.eloRate ?? null) : (user?.eloRate ?? null)
  const rank = eloToRank(elo)

  const useSeason = seasonStats.played > 0
  const head: HeadStats = {
    wins: useSeason ? seasonStats.wins : analytics.wins,
    losses: useSeason ? seasonStats.loses : analytics.losses,
    played: useSeason ? seasonStats.played : analytics.played,
    bestTime: (useSeason && seasonStats.bestTime) || analytics.best,
    currentStreak: useSeason ? seasonStats.currentStreak : Math.max(0, analytics.currentStreak),
    bestStreak: useSeason ? seasonStats.bestStreak : analytics.bestWinStreak,
    elo,
    netElo: analytics.netElo,
    averageWin: (useSeason && seasonStats.averageTime) || analytics.averageWin
  }

  const deaths = useMemo(() => countDeaths(uuid ?? '', details ?? []), [uuid, details])
  const perfWorld = useMemo(
    () => splitPerformance(uuid ?? '', details ?? [], WORLD_BUCKET),
    [uuid, details]
  )
  const speed = useMemo(() => speedFromPerf(perfWorld), [perfWorld])
  const scorecard = useMemo(
    () => buildScorecard(analytics, seasonWinRate, seasonStats.played, deaths, speed),
    [analytics, seasonWinRate, seasonStats.played, deaths, speed]
  )
  const playerSegs = useMemo(() => playerSegments(uuid ?? '', details ?? []), [uuid, details])

  return {
    user,
    matches,
    details: details ?? [],
    analytics,
    season: seasonStats,
    scope,
    seasonWinRate,
    head,
    deaths,
    scorecard,
    perfWorld,
    playerSegs,
    rank,
    hasData: head.played > 0 || analytics.played > 0,
    recentN: (matches ?? []).filter((m) => m.type === 2).length,
    analyzedN: detailIds.length,
    loading: enabled && matchesLoading && !matches,
    detailsLoading: enabled && detailsLoading && !details
  }
}

export type PlayerAnalytics = ReturnType<typeof usePlayerAnalytics>
