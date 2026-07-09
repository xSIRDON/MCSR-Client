// One hook = one player's full ranked analytics. Used by the self-review, searched
// profiles, and both sides of the Compare view, so every surface derives its numbers
// the exact same way (and shares the react-query cache).
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
  /** Average completion time across recent wins (ms), or null. */
  averageWin: number | null
}

/** The current ranked season number, from the leaderboard metadata. */
export function useCurrentSeason(): number | undefined {
  const { data } = useQuery({
    queryKey: ['season-meta'],
    queryFn: () => mcsr.getLeaderboard(),
    staleTime: 60 * 60 * 1000
  })
  return data?.season?.number
}

/** Undefined = current season; a number = that season; 'all' = career totals. */
export type SeasonSel = number | 'all' | undefined

export function usePlayerAnalytics(uuid: string | null | undefined, season?: SeasonSel) {
  const enabled = !!uuid
  // 'all' has no API-side filter: the user response already carries statistics.total, and the
  // matches endpoint is current-season only — so 'all' fetches like the default and only the
  // derived stat scope changes.
  const seasonNum = typeof season === 'number' ? season : undefined
  // Keys omit the season when unset so the default view shares the cache with the
  // sidebar/profile queries that fetch the same player without a season filter.
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

  const analytics = useMemo(() => analyzeRanked(uuid ?? '', matches ?? []), [uuid, matches])

  // Splits live in each match's timeline (the detail endpoint), so fetch the recent matches'
  // details — politeFetch serializes the requests — and cache them for the session.
  const detailIds = useMemo(
    () =>
      (matches ?? [])
        .filter((m) => m.type === 2)
        .slice(0, 30)
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
          /* skip a failed detail fetch */
        }
      }
      return out
    },
    enabled: enabled && detailIds.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
    // The app-wide default is refetchOnMount:'always', which would replay all 30 serialized
    // detail fetches every time a page using this hook mounts — burning the 500 req/10min
    // budget this Infinity staleTime exists to protect. Cached details never go stale.
    refetchOnMount: false
  })

  // For a past season, the player's Elo is that season's closing rating, not their live one.
  // 'all' (career) and the current season both use the live rating.
  const elo =
    seasonNum != null ? (user?.seasonResult?.last?.eloRate ?? null) : (user?.eloRate ?? null)
  const rank = eloToRank(elo)

  // Headline totals come from the authoritative season statistics (getUser). The matches
  // endpoint only returns a recent window, so counting wins from it under-reports a player's
  // record (e.g. a recent losing streak reads as "0 wins"). The match list still drives the
  // recent-detail analytics.
  // NOTE: named seasonStats (not `season`) — `season` is the hook's season-selector param.
  // 'all' pulls the career totals block instead of the (requested) season's.
  const scope: 'season' | 'total' = season === 'all' ? 'total' : 'season'
  const seasonStats = rankedStats(user, scope)
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
    averageWin: analytics.averageWin
  }

  const seasonDecided = seasonStats.wins + seasonStats.loses
  const seasonWinRate =
    seasonDecided > 0 ? Math.round((seasonStats.wins / seasonDecided) * 1000) / 10 : null

  const deaths = useMemo(() => countDeaths(uuid ?? '', details ?? []), [uuid, details])
  const perfWorld = useMemo(
    () => splitPerformance(uuid ?? '', details ?? [], WORLD_BUCKET),
    [uuid, details]
  )
  // "Speed" play-style dim: overall run pace vs the field (average of the split percentiles).
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
    /** Which stats block the head numbers come from: one season or career totals. */
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
    /** How many matches the split analytics actually cover (details are capped at 30). */
    analyzedN: detailIds.length,
    loading: enabled && matchesLoading && !matches,
    detailsLoading: enabled && detailsLoading && !details
  }
}

export type PlayerAnalytics = ReturnType<typeof usePlayerAnalytics>
