import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { useInstances } from '../hooks/useInstances'
import { mcsr } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { PlayerHead } from '../components/PlayerHead'
import { RankBadge } from '../components/RankBadge'
import { RankedCard, RsgCard } from '../components/ModeCards'
import { EloChart } from '../components/EloChart'
import { MatchFeed } from '../components/MatchFeed'
import { Leaderboard } from '../components/Leaderboard'
import { LivePacePanel } from '../components/LivePacePanel'
import { ChokeLine } from '../components/ChokeLine'

export function Home() {
  const profile = useUi((s) => s.profile)
  const pacemanName = useUi((s) => s.pacemanName)
  const init = useInstances((s) => s.init)
  useEffect(() => init(), [init])
  if (!profile) return null

  return (
    <div className="mx-auto max-w-[1120px] space-y-4 px-5 py-4">
      <HomeHero uuid={profile.uuid} name={profile.name} />

      {/* the dashboard: two living mode cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RankedCard uuid={profile.uuid} delay={40} />
        <RsgCard name={pacemanName} delay={110} />
      </div>

      {/* depth — ranked on the left, rsg on the right, mirroring the cards above */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <EloChart uuid={profile.uuid} />
          <MatchFeed uuid={profile.uuid} />
        </div>
        <div className="space-y-4">
          <LivePacePanel name={pacemanName} />
          <ChokeLine name={pacemanName} />
        </div>
      </div>

      <Leaderboard limit={10} />
    </div>
  )
}

function HomeHero({ uuid, name }: { uuid: string; name: string }) {
  const { data: user } = useQuery({ queryKey: ['user', uuid], queryFn: () => mcsr.getUser(uuid) })
  const rank = eloToRank(user?.eloRate)

  return (
    <header className="flex flex-wrap items-center gap-4 animate-fade-up">
      <div
        className="rounded-xl p-1"
        style={{ boxShadow: `0 0 0 1.5px ${rank.color}55, 0 0 22px ${rank.glow}33` }}
      >
        <PlayerHead id={uuid} uuid={uuid} size={52} className="rounded-lg" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.22em] text-faint">Welcome back</div>
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-2xl tracking-wide text-text">{name}</h1>
          {user?.country && (
            <img
              src={`https://flagcdn.com/h20/${user.country.toLowerCase()}.png`}
              alt={user.country}
              className="h-[14px] w-auto rounded-[2px] ring-1 ring-[var(--line)]"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          )}
        </div>
      </div>
      <div className="ml-auto hidden sm:block">
        <RankBadge elo={user?.eloRate} size="md" />
      </div>
    </header>
  )
}
