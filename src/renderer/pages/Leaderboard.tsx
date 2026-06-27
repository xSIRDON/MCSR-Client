import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { mcsr } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { PlayerHead } from '../components/PlayerHead'
import { PlayerSearch } from '../components/PlayerSearch'

export function Leaderboard() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard-full'],
    queryFn: () => mcsr.getLeaderboard()
  })

  const users = data?.users ?? []

  return (
    <div className="mx-auto max-w-[980px] space-y-4 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-base uppercase tracking-[0.2em] text-muted">Leaderboard</h1>
        <div className="w-60">
          <PlayerSearch placeholder="Look up player…" />
        </div>
      </div>

      <section className="surface p-2 animate-fade-up">
        {isLoading ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="grid h-40 place-items-center text-sm text-muted">
            Couldn’t load the leaderboard. Try again later.
          </div>
        ) : users.length === 0 ? (
          <div className="grid h-40 place-items-center text-sm text-muted">No players to show.</div>
        ) : (
          <div className="space-y-0.5">
            {users.map((u, idx) => {
              const rank = eloToRank(u.eloRate)
              const pos = u.eloRank ?? idx + 1
              const top3 = pos <= 3
              return (
                <button
                  key={u.uuid}
                  onClick={() => navigate(`/profile?name=${encodeURIComponent(u.nickname)}`)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span
                    className="font-display tnum w-8 shrink-0 text-center text-sm"
                    style={{ color: top3 ? 'var(--gold)' : 'var(--faint)' }}
                  >
                    {pos}
                  </span>

                  <PlayerHead id={u.uuid} uuid={u.uuid} size={30} className="rounded shrink-0" />

                  <span
                    className="min-w-0 flex-1 truncate text-sm"
                    style={{ color: top3 ? 'var(--gold)' : 'var(--text)' }}
                  >
                    {u.nickname}
                  </span>

                  {u.country && (
                    <img
                      src={`https://flagcdn.com/h20/${u.country.toLowerCase()}.png`}
                      alt={u.country}
                      title={u.country.toUpperCase()}
                      width={20}
                      className="h-[15px] w-auto shrink-0 rounded-[2px] ring-1 ring-[var(--line)]"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  )}

                  <span
                    className="font-display tnum w-14 shrink-0 text-right text-sm"
                    style={{ color: rank.color }}
                    title={`${rank.name}${u.eloRate != null ? ` · ${u.eloRate} ELO` : ''}`}
                  >
                    {u.eloRate ?? '—'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
