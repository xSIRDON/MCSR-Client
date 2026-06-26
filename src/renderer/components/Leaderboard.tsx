import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { mcsr } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { PlayerHead } from './PlayerHead'
import { PlayerSearch } from './PlayerSearch'

export function Leaderboard({ limit = 12 }: { limit?: number }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => mcsr.getLeaderboard()
  })

  const users = data?.users?.slice(0, limit) ?? []

  return (
    <section className="surface flex min-h-0 flex-col p-5 animate-fade-up" style={{ animationDelay: '150ms' }}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">Leaderboard</h2>
        <div className="w-48">
          <PlayerSearch placeholder="Look up player…" />
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {isLoading
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-11" />)
          : users.map((u, idx) => {
              const rank = eloToRank(u.eloRate)
              const pos = u.eloRank ?? idx + 1
              return (
                <button
                  key={u.uuid}
                  onClick={() => navigate(`/profile?name=${encodeURIComponent(u.nickname)}`)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span
                    className="font-display tnum w-7 text-center text-sm"
                    style={{ color: pos <= 3 ? 'var(--gold)' : 'var(--faint)' }}
                  >
                    {pos}
                  </span>
                  <PlayerHead id={u.uuid} uuid={u.uuid} size={28} className="rounded" />
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{u.nickname}</span>
                  <span className="font-display tnum text-sm" style={{ color: rank.color }}>
                    {u.eloRate ?? '—'}
                  </span>
                </button>
              )
            })}
        {!isLoading && users.length === 0 && (
          <div className="grid h-20 place-items-center text-sm text-muted">Leaderboard unavailable.</div>
        )}
      </div>
    </section>
  )
}
