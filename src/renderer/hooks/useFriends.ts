// Watchlist favorites, mutual-friends network state, and live presence for the rail.
// Public presence comes from MCSR /live (ranked matches, split, twitch) and paceman's
// liveruns (RSG pace) plus lastOnline; the friends network adds "in the client" heartbeats.
import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { mcsr, paceman } from '../lib/clients'
import { useUi } from '../store/uiStore'
import { epochToAgo } from '@core/format'
import type { LiveMatch } from '@services/mcsr-ranked'
import type { FriendsNetState } from '@shared/types'

/** MCSR uuids are dashless lowercase; paceman's are dashed. Normalize for matching. */
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
    setFavorites(next) // optimistic — config write follows
    await window.mcsr.config.set({ favorites: next })
  }
  return { favorites, isFavorite, toggle }
}

// Friendly names for "where they are" labels.
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

/** Within this window of lastOnline a friend counts as "online" (queueing, in menus…). */
const ONLINE_WINDOW_S = 10 * 60

export interface FriendPresence {
  uuid: string
  nickname: string
  eloRate: number | null
  status: 'ranked' | 'pace' | 'online' | 'offline'
  /** Static label: "Ranked vs Feinberg · Fortress", "RSG · First Portal", "Last seen 2h ago". */
  detail: string
  /** For a live run: a client-side ticking clock — `base` ms elapsed captured at unix-ms `anchor`,
   *  so the UI can count up (base + now − anchor) without re-fetching every second. */
  live?: { base: number; anchor: number }
  /** Twitch url when they're streaming, for a Watch link. */
  liveUrl: string | null
}

const STATUS_RANK: Record<FriendPresence['status'], number> = {
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

/** Public-feed presence for any list of players (watchlist rows, friends rows). */
export function useLivePresence(uuids: string[]): FriendPresence[] {
  // One request each covers every player; poll gently. dataUpdatedAt anchors the live
  // clocks so they can tick locally between polls.
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
  // Identity + lastOnline per player — slow-moving, refresh a few times an hour.
  const users = useQueries({
    queries: uuids.map((uuid) => ({
      queryKey: ['user', uuid],
      queryFn: () => mcsr.getUser(uuid),
      staleTime: 3 * 60_000,
      refetchInterval: 5 * 60_000
    }))
  })

  return useMemo<FriendPresence[]>(() => {
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
        // RTA ticks with wall-clock; anchor to the run's own last-updated stamp when present.
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

export function sortPresence(list: FriendPresence[]): FriendPresence[] {
  return [...list].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.nickname.localeCompare(b.nickname)
  )
}

/** The watchlist (one-way favorites) with live presence, sorted in-game first. */
export function useFriendsPresence(): { friends: FriendPresence[]; inGame: number } {
  const favorites = useUi((s) => s.favorites)
  const presence = useLivePresence(favorites)
  const friends = useMemo(() => sortPresence(presence), [presence])
  return {
    friends,
    inGame: friends.filter((f) => f.status === 'ranked' || f.status === 'pace').length
  }
}

const EMPTY_NET: FriendsNetState = {
  configured: false,
  connected: false,
  error: null,
  friends: [],
  incoming: [],
  outgoing: []
}

/** Mutual-friends network state, kept in sync with the main process. */
export function useFriendsNet(): FriendsNetState {
  const [net, setNet] = useState<FriendsNetState>(EMPTY_NET)
  useEffect(() => {
    let active = true
    void window.mcsr.friends.state().then((s) => {
      if (active) setNet(s)
    })
    const off = window.mcsr.friends.onChanged(setNet)
    return () => {
      active = false
      off()
    }
  }, [])
  return net
}

const NET_STATE_LABEL: Record<string, string> = {
  idle: 'In the client',
  ranked: 'In the client · Ranked',
  rsg: 'In the client · RSG',
  zsg: 'In the client · ZSG'
}

/**
 * Mutual friends with merged presence: rich public-feed detail (ranked split, RSG pace)
 * when they're in a public game, else their client heartbeat, else last seen.
 */
export function useMutualPresence(
  net: FriendsNetState
): { rows: FriendPresence[]; inGame: number; online: number } {
  const uuids = useMemo(() => net.friends.map((f) => normUuid(f.uuid)), [net.friends])
  const pub = useLivePresence(uuids)
  const rows = useMemo(() => {
    const merged = net.friends.map((f, i) => {
      const p = pub[i]
      const nickname = f.nickname || p?.nickname || '…'
      if (p && (p.status === 'ranked' || p.status === 'pace')) return { ...p, nickname }
      if (f.state !== 'offline') {
        return {
          uuid: normUuid(f.uuid),
          nickname,
          eloRate: p?.eloRate ?? null,
          status: 'online' as const,
          detail: NET_STATE_LABEL[f.state] ?? 'In the client',
          liveUrl: null
        }
      }
      return {
        uuid: normUuid(f.uuid),
        nickname,
        eloRate: p?.eloRate ?? null,
        status: 'offline' as const,
        detail: f.lastSeen ? `Last seen ${epochToAgo(f.lastSeen)}` : (p?.detail ?? 'Offline'),
        liveUrl: null
      }
    })
    return sortPresence(merged)
  }, [net.friends, pub])
  return {
    rows,
    // "Live" = actually in a MCSR match or on an RSG world right now (not just app-open).
    inGame: rows.filter((f) => f.status === 'ranked' || f.status === 'pace').length,
    online: rows.filter((f) => f.status !== 'offline').length
  }
}
