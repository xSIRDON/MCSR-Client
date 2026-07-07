// Player-name typeahead sourced entirely from MCSR's API. There is no fuzzy-search
// endpoint, so the corpus is: the top-150 leaderboard, your friends/watchlist, and any
// player you've already looked at (react-query cache) — matched by prefix then substring.
// A debounced exact `getUser` covers anyone off that list (canonical casing).
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { mcsr } from '../lib/clients'
import { useFriendsNet } from './useFriends'
import type { McsrUser } from '@services/mcsr-ranked'

const MAX = 7

export function usePlayerSuggestions(query: string): string[] {
  const q = query.trim().toLowerCase()
  const qc = useQueryClient()
  const net = useFriendsNet()

  const { data: lb } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => mcsr.getLeaderboard(),
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000
  })

  // The known-name corpus (deduped, case-insensitive), refreshed as you browse.
  const names = useMemo(() => {
    const byLower = new Map<string, string>()
    const add = (n?: string | null) => {
      if (n && !byLower.has(n.toLowerCase())) byLower.set(n.toLowerCase(), n)
    }
    for (const u of lb?.users ?? []) add(u.nickname)
    for (const f of [...net.friends, ...net.incoming, ...net.outgoing]) add(f.nickname)
    // Everyone this session has viewed a profile for.
    for (const [, data] of qc.getQueriesData<McsrUser>({ queryKey: ['user'] })) {
      add(data?.nickname)
    }
    return [...byLower.values()]
    // net object identity changes on every poll; depend on its lists' lengths to limit churn.
  }, [lb, qc, net.friends, net.incoming, net.outgoing])

  // Debounced exact lookup for names not in the corpus (e.g. a mid-ladder player).
  const [exact, setExact] = useState<string | null>(null)
  useEffect(() => {
    if (q.length < 2) {
      setExact(null)
      return
    }
    let alive = true
    const t = setTimeout(() => {
      void mcsr
        .getUser(q)
        .then((u) => alive && setExact(u.nickname))
        .catch(() => alive && setExact(null))
    }, 350)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  return useMemo(() => {
    if (!q) return []
    const prefix = names.filter((n) => n.toLowerCase().startsWith(q))
    const sub = names.filter((n) => {
      const l = n.toLowerCase()
      return !l.startsWith(q) && l.includes(q)
    })
    const ranked = [...prefix, ...sub]
    if (exact && !ranked.some((n) => n.toLowerCase() === exact.toLowerCase())) ranked.unshift(exact)
    // Drop an exact-typed match to the top isn't needed; just cap.
    return ranked.slice(0, MAX)
  }, [q, names, exact])
}
