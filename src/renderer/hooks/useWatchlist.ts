import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { mcsr, paceman } from '../lib/clients'
import { useUi } from '../store/uiStore'
import { epochToAgo } from '@core/format'
import type { LiveMatch } from '@services/mcsr-ranked'

export function normUuid(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase()
}

export function useFavorites() {
  const favorites = useUi((s) => s.favorites)
  const setFavorites = useUi((s) => s.setFavorites)
  const isFavorite = (uuid: string): boolean => favorites.includes(normUuid(uuid))
  const toggle = async (uuid: string): Promise<void> => {
    const id = normUuid(uuid)
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]
    setFavorites(next)
    await window.mcsr.config.set({ favorites: next })
  }
  return { favorites, isFavorite, toggle }
}

const RANKED_EVENT_LABEL: Record<string, string> = {
  'story.enter_the_nether': 'Nether',
  'nether.find_bastion': 'Bastion',
  'nether.find_fortress': 'Fortress',
  'projectelo.timeline.blind_travel': 'Blind',
  'story.follow_ender_eye': 'Stronghold',
  'story.enter_the_end': 'The End'
}
const RSG_EVENT_LABEL: Record<string, string> = {
  'rsg.enter_nether': 'Nether',
  'rsg.enter_bastion': 'Bastion',
  'rsg.enter_fortress': 'Fortress',
  'rsg.first_portal': 'First Portal',
  'rsg.second_portal': 'Second Portal',
  'rsg.enter_stronghold': 'Stronghold',
  'rsg.enter_end': 'The End',
  'rsg.credits': 'Finish!'
}

const ONLINE_WINDOW_S = 10 * 60

export interface RunnerPresence {
  uuid: string
  nickname: string
  eloRate: number | null
  status: 'ranked' | 'pace' | 'online' | 'offline'
  detail: string
  live?: { base: number; anchor: number }
  liveUrl: string | null
}

const STATUS_RANK: Record<RunnerPresence['status'], number> = {
  ranked: 0,
  pace: 1,
  online: 2,
  offline: 3
}

function rankedDetail(
  uuid: string,
  m: LiveMatch,
  anchor: number
): { detail: string; live: { base: number; anchor: number }; liveUrl: string | null } {
  const opp = m.players.find((p) => normUuid(p.uuid) !== uuid)
  const mine = m.data?.[Object.keys(m.data ?? {}).find((k) => normUuid(k) === uuid) ?? '']
  const at = mine?.timeline ? (RANKED_EVENT_LABEL[mine.timeline.type] ?? null) : null
  return {
    detail: `Ranked vs ${opp?.nickname ?? '?'}${at ? ` · ${at}` : ''}`,
    live: { base: m.currentTime, anchor },
    liveUrl: mine?.liveUrl ?? null
  }
}

export function useLivePresence(uuids: string[]): RunnerPresence[] {
  const liveQ = useQuery({
    queryKey: ['live-feed'],
    queryFn: () => mcsr.getLive(),
    refetchInterval: 15_000,
    enabled: uuids.length > 0
  })
  const paceQ = useQuery({
    queryKey: ['pace-live'],
    queryFn: () => paceman.getLiveRuns(),
    refetchInterval: 15_000,
    enabled: uuids.length > 0
  })
  const live = liveQ.data
  const liveRuns = paceQ.data
  const liveAnchor = liveQ.dataUpdatedAt
  const paceAnchor = paceQ.dataUpdatedAt
  const users = useQueries({
    queries: uuids.map((uuid) => ({
      queryKey: ['user', uuid],
      queryFn: () => mcsr.getUser(uuid),
      staleTime: 3 * 60_000,
      refetchInterval: 5 * 60_000
    }))
  })

  return useMemo<RunnerPresence[]>(() => {
    const nowS = Math.floor(Date.now() / 1000)
    const byRanked = new Map<string, LiveMatch>()
    for (const m of live?.liveMatches ?? []) {
      for (const p of m.players) byRanked.set(normUuid(p.uuid), m)
    }
    const byPace = new Map(
      (liveRuns ?? [])
        .filter((r) => !r.isHidden && !r.isCheated)
        .map((r) => [normUuid(r.user.uuid), r] as const)
    )

    return uuids.map((uuid, i) => {
      const user = users[i]?.data
      const nickname = user?.nickname ?? '…'
      const eloRate = user?.eloRate ?? null

      const rankedMatch = byRanked.get(uuid)
      if (rankedMatch) {
        const { detail, live: clock, liveUrl } = rankedDetail(uuid, rankedMatch, liveAnchor)
        return { uuid, nickname, eloRate, status: 'ranked' as const, detail, live: clock, liveUrl }
      }
      const pace = byPace.get(uuid)
      if (pace) {
        const last = pace.eventList[pace.eventList.length - 1]
        const at = last ? (RSG_EVENT_LABEL[last.eventId] ?? 'On pace') : 'On pace'
        const anchor = typeof pace.lastUpdated === 'number' ? pace.lastUpdated : paceAnchor
        return {
          uuid,
          nickname: pace.nickname || nickname,
          eloRate,
          status: 'pace' as const,
          detail: `RSG · ${at}`,
          live: last ? { base: last.rta, anchor } : undefined,
          liveUrl: pace.user.liveAccount ? `https://twitch.tv/${pace.user.liveAccount}` : null
        }
      }
      const lastOnline = user?.timestamp?.lastOnline
      if (lastOnline && nowS - lastOnline < ONLINE_WINDOW_S) {
        return { uuid, nickname, eloRate, status: 'online' as const, detail: 'Online', liveUrl: null }
      }
      return {
        uuid,
        nickname,
        eloRate,
        status: 'offline' as const,
        detail: lastOnline ? `Last seen ${epochToAgo(lastOnline)}` : 'Offline',
        liveUrl: null
      }
    })
  }, [uuids, live, liveRuns, users])
}

export function sortPresence(list: RunnerPresence[]): RunnerPresence[] {
  return [...list].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.nickname.localeCompare(b.nickname)
  )
}

export function useWatchlist(): { runners: RunnerPresence[]; inGame: number } {
  const favorites = useUi((s) => s.favorites)
  const presence = useLivePresence(favorites)
  const runners = useMemo(() => sortPresence(presence), [presence])
  return {
    runners,
    inGame: runners.filter((f) => f.status === 'ranked' || f.status === 'pace').length
  }
}
