import { useQuery } from '@tanstack/react-query'
import { mcsr, } from '../lib/clients'
import { seasonRanked } from '@services/mcsr-ranked'
import { eloToRank } from '@core/rank'
import { msToTime, winRate } from '@core/format'
import { PlayerHead } from './PlayerHead'
import { RankBadge } from './RankBadge'
import { StatTile } from './StatTile'

export function ProfileHero({ identifier }: { identifier: string }) {
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['user', identifier],
    queryFn: () => mcsr.getUser(identifier)
  })

  if (isLoading) return <HeroSkeleton />
  if (isError || !user)
    return (
      <div className="surface grid h-[230px] place-items-center text-muted">
        Couldn't load <span className="mx-1 text-text">{identifier}</span>. Check the name and try again.
      </div>
    )

  const rank = eloToRank(user.eloRate)
  const stats = seasonRanked(user)
  const wr = winRate(stats.wins, stats.loses)
  const decay = user.timestamp?.nextDecay

  return (
    <section
      className="surface relative overflow-hidden p-5 animate-fade-up"
      style={{ boxShadow: `0 8px 30px rgba(0,0,0,.55), inset 0 0 50px ${rank.color}0d` }}
    >
      {/* tier glow wash */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full blur-3xl"
        style={{ background: rank.glow, opacity: 0.12 }}
      />
      <div className="relative flex flex-wrap items-center gap-5">
        <div
          className="relative shrink-0 rounded-xl p-1.5"
          style={{ background: `radial-gradient(circle at 50% 20%, ${rank.color}22, transparent 70%)` }}
        >
          <PlayerHead id={user.uuid} uuid={user.uuid} size={72} render="body" className="rounded-md" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-2xl font-bold tracking-tight">{user.nickname}</h1>
            {user.country && (
              <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted">
                {user.country}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Elo</div>
              <div
                className="font-display tnum animate-count text-5xl leading-none"
                style={{ color: rank.color, textShadow: `0 0 24px ${rank.glow}55` }}
              >
                {user.eloRate ?? '—'}
              </div>
            </div>
            <div className="mb-0.5 flex flex-col gap-1.5">
              <RankBadge elo={user.eloRate} size="md" />
              <div className="text-xs text-muted">
                Global rank <span className="font-display text-text">#{user.eloRank ?? '—'}</span>
              </div>
            </div>
          </div>

          {decay ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-[var(--loss)]/30 bg-[var(--loss)]/10 px-2.5 py-0.5 text-xs text-[var(--loss)]">
              ⚠ ELO decay scheduled — play a ranked match to reset it.
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Win Rate" value={`${wr}%`} accent={wr >= 50 ? 'var(--win)' : undefined} hint={`${stats.wins}W · ${stats.loses}L`} delay={40} />
        <StatTile label="Win Streak" value={stats.currentStreak} hint={`best ${stats.bestStreak}`} delay={90} />
        <StatTile label="Best Time" value={msToTime(stats.bestTime)} accent="var(--gold)" delay={140} />
        <StatTile label="Matches" value={stats.played} hint="this season" delay={190} />
      </div>
    </section>
  )
}

function HeroSkeleton() {
  return (
    <div className="surface flex items-center gap-6 p-6">
      <div className="skeleton h-24 w-24" />
      <div className="flex-1 space-y-3">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-14 w-40" />
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      </div>
    </div>
  )
}
