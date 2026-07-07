import { useQuery } from '@tanstack/react-query'
import { mcsr, } from '../lib/clients'
import { rankedStats } from '@services/mcsr-ranked'
import { eloToRank } from '@core/rank'
import { msToTime, winRate } from '@core/format'
import type { SeasonSel } from '../hooks/usePlayerAnalytics'
import { useFavorites, useFriendsNet, normUuid } from '../hooks/useFriends'
import { useUi } from '../store/uiStore'
import { PlayerHead } from './PlayerHead'
import { RankBadge } from './RankBadge'
import { StatTile } from './StatTile'
import { DonorBadge } from './DonorBadge'

/** Mutual friend-request button — only when the friends network is connected. */
function AddFriendButton({ uuid, nickname }: { uuid: string; nickname: string }) {
  const net = useFriendsNet()
  const self = useUi((s) => s.profile)
  const id = normUuid(uuid)
  if (!net.connected || !self || normUuid(self.uuid) === id) return null

  const isFriend = net.friends.some((f) => normUuid(f.uuid) === id)
  const isOutgoing = net.outgoing.some((f) => normUuid(f.uuid) === id)
  const isIncoming = net.incoming.some((f) => normUuid(f.uuid) === id)

  if (isFriend)
    return <span className="rounded-full bg-[var(--win)]/12 px-2.5 py-1 text-[11px] text-[var(--win)]">Friends ✓</span>
  if (isOutgoing)
    return <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-faint">Request sent</span>
  if (isIncoming)
    return (
      <button
        onClick={() => void window.mcsr.friends.accept(id)}
        className="rounded-full bg-[var(--gold)]/15 px-2.5 py-1 text-[11px] text-[var(--gold)] transition-all hover:brightness-125"
      >
        Accept request
      </button>
    )
  return (
    <button
      onClick={() => void window.mcsr.friends.request(id, nickname)}
      className="rounded-full border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-2.5 py-1 text-[11px] text-[var(--gold)] transition-all hover:brightness-125"
    >
      + Add friend
    </button>
  )
}

/** Star toggle — adds/removes this player from the watchlist in the friends rail. */
function FavoriteStar({ uuid }: { uuid: string }) {
  const { isFavorite, toggle } = useFavorites()
  const fav = isFavorite(uuid)
  return (
    <button
      onClick={() => void toggle(uuid)}
      title={fav ? 'Remove from friends' : 'Add to friends'}
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
  // No MCSR Ranked profile (or the name doesn't resolve): show a friendly identity card rather
  // than a raw error. RSG stats still work from the RSG tab.
  if (isError || !user)
    return (
      <section className="surface flex flex-wrap items-center gap-5 p-5 animate-fade-up">
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

  // Past seasons show that season's closing rating/rank; current and career use the live one.
  const elo = seasonNum != null ? (user.seasonResult?.last?.eloRate ?? null) : user.eloRate
  const eloRank = seasonNum != null ? (user.seasonResult?.last?.eloRank ?? null) : user.eloRank
  const rank = eloToRank(elo)
  const stats = rankedStats(user, season === 'all' ? 'total' : 'season')
  const matchesHint = season === 'all' ? 'career' : seasonNum != null ? `season ${seasonNum}` : 'this season'
  const wr = winRate(stats.wins, stats.loses)
  // The decay warning is about the live rating — meaningless on a past-season view.
  const decay = seasonNum == null ? user.timestamp?.nextDecay : null

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
            <FavoriteStar uuid={user.uuid} />
            <AddFriendButton uuid={user.uuid} nickname={user.nickname} />
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
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Elo</div>
              <div
                className="font-display tnum animate-count text-5xl leading-none"
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

          {decay ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-[var(--loss)]/30 bg-[var(--loss)]/10 px-2.5 py-0.5 text-xs text-[var(--loss)]">
              ⚠ ELO decay scheduled — play a ranked match to reset it.
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative mt-4 grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        <StatTile label="Win Rate" value={`${wr}%`} accent={wr >= 50 ? 'var(--win)' : undefined} hint={`${stats.wins}W · ${stats.loses}L`} delay={40} />
        <StatTile label="Win Streak" value={stats.currentStreak} hint={`best ${stats.bestStreak}`} delay={90} />
        <StatTile label="Best Time" value={msToTime(stats.bestTime)} accent="var(--gold)" delay={140} />
        <StatTile label="Matches" value={stats.played} hint={matchesHint} delay={190} />
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
