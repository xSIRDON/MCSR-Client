import { useQuery } from '@tanstack/react-query'
import { mcsr, } from '../lib/clients'
import { rankedStats } from '@services/mcsr-ranked'
import { eloToRank } from '@core/rank'
import { msToTime, winRate } from '@core/format'
import type { SeasonSel } from '../hooks/usePlayerAnalytics'
import { useFavorites } from '../hooks/useWatchlist'
import { PlayerHead } from './PlayerHead'
import { RankBadge } from './RankBadge'
import { StatTile } from './StatTile'
import { DonorBadge } from './DonorBadge'

function FavoriteStar({ uuid }: { uuid: string }) {
  const { isFavorite, toggle } = useFavorites()
  const fav = isFavorite(uuid)
  return (
    <button
      onClick={() => void toggle(uuid)}
      title={fav ? 'Remove from watchlist' : 'Add to watchlist'}
      className="shrink-0 transition-transform hover:scale-110"
      style={{ color: fav ? 'var(--gold)' : 'var(--faint)' }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill={fav ? 'currentColor' : 'none'}>
        <path
          d="M9 1.8l2.2 4.4 4.9.7-3.5 3.5.8 4.9L9 13l-4.4 2.3.8-4.9L1.9 6.9l4.9-.7L9 1.8z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export function ProfileHero({
  identifier,
  name,
  season
}: {
  identifier: string
  name?: string
  season?: SeasonSel
}) {
  const seasonNum = typeof season === 'number' ? season : undefined
  const { data: user, isLoading, isError } = useQuery({
    queryKey: seasonNum != null ? ['user', identifier, seasonNum] : ['user', identifier],
    queryFn: () => mcsr.getUser(identifier, { season: seasonNum })
  })

  if (isLoading) return <HeroSkeleton />
  if (isError || !user)
    return (
      <section className="surface flex flex-wrap items-center gap-5 p-5">
        <PlayerHead
          id={identifier}
          uuid={identifier}
          size={64}
          render="body"
          className="rounded-md opacity-90"
        />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-text">
            {name || identifier}
          </h1>
          <p className="mt-1.5 text-sm text-muted">No MCSR Ranked profile yet.</p>
          <p className="mt-0.5 text-xs text-faint">
            Play a ranked match to start tracking ranked stats here.
          </p>
        </div>
      </section>
    )

  const elo = seasonNum != null ? (user.seasonResult?.last?.eloRate ?? null) : user.eloRate
  const eloRank = seasonNum != null ? (user.seasonResult?.last?.eloRank ?? null) : user.eloRank
  const rank = eloToRank(elo)
  const stats = rankedStats(user, season === 'all' ? 'total' : 'season')
  const matchesHint = season === 'all' ? 'career' : seasonNum != null ? `season ${seasonNum}` : 'this season'
  const wr = winRate(stats.wins, stats.loses)

  return (
    <section className="surface relative overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full opacity-[0.12] blur-3xl"
        style={{ background: rank.glow }}
      />
      <div className="relative flex flex-wrap items-center gap-5">
        <div
          className="relative shrink-0 rounded-xl p-1.5"
        >
          <PlayerHead id={user.uuid} uuid={user.uuid} size={72} render="body" className="rounded-md" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-2xl font-bold tracking-tight">{user.nickname}</h1>
            <FavoriteStar uuid={user.uuid} />
            <DonorBadge roleType={user.roleType} withLabel />
            {user.country && (
              <img
                src={`https://flagcdn.com/h20/${user.country.toLowerCase()}.png`}
                alt={user.country}
                title={user.country.toUpperCase()}
                width={20}
                className="h-[15px] w-auto rounded-[2px] ring-1 ring-[var(--line)]"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-4">
            <div>
              <div className="text-[10px] text-muted">Elo</div>
              <div
                className="font-display tnum text-5xl leading-none"
                style={{ color: rank.color, textShadow: `0 0 24px ${rank.glow}55` }}
              >
                {elo ?? '—'}
              </div>
            </div>
            <div className="mb-0.5 flex flex-col gap-1.5">
              <RankBadge elo={elo} size="md" />
              <div className="text-xs text-muted">
                Global rank <span className="font-display text-text">#{eloRank ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-y-4 border-t border-[var(--line)] pt-4 md:grid-cols-6">
        <StatTile label="Win rate" value={`${wr}%`} accent={wr >= 50 ? 'var(--win)' : undefined} hint={`${stats.wins}W · ${stats.loses}L`} />
        <StatTile label="Win streak" value={stats.currentStreak} hint={`best ${stats.bestStreak}`} />
        <StatTile label="Best time" value={msToTime(stats.bestTime)} accent="var(--gold)" />
        <StatTile
          label="Average"
          value={stats.averageTime != null ? msToTime(stats.averageTime) : '—'}
          hint={`${stats.completions} finishes`}
        />
        <StatTile
          label="Forfeit rate"
          value={stats.forfeitRate != null ? `${stats.forfeitRate}%` : '—'}
          hint={`${stats.forfeits} forfeits`}
        />
        <StatTile label="Matches" value={stats.played} hint={matchesHint} />
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
        <div className="grid grid-cols-6 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      </div>
    </div>
  )
}
