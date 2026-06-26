import { useUi } from '../store/uiStore'
import { ProfileHero } from '../components/ProfileHero'
import { EloChart } from '../components/EloChart'
import { MatchFeed } from '../components/MatchFeed'
import { Leaderboard } from '../components/Leaderboard'
import { LivePacePanel } from '../components/LivePacePanel'

export function Home() {
  const profile = useUi((s) => s.profile)
  const pacemanName = useUi((s) => s.pacemanName)
  if (!profile) return null

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-7 py-6">
      <ProfileHero identifier={profile.uuid} />

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          <EloChart uuid={profile.uuid} />
          <Leaderboard limit={10} />
        </div>
        <div className="flex flex-col gap-5">
          <LivePacePanel name={pacemanName} />
          <div className="flex min-h-[260px] flex-col">
            <MatchFeed uuid={profile.uuid} />
          </div>
        </div>
      </div>
    </div>
  )
}
