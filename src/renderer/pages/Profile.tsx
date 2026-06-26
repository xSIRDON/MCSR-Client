import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { ProfileHero } from '../components/ProfileHero'
import { EloChart } from '../components/EloChart'
import { MatchFeed } from '../components/MatchFeed'
import { PlayerSearch } from '../components/PlayerSearch'

export function Profile() {
  const [params] = useSearchParams()
  const profile = useUi((s) => s.profile)
  const queried = params.get('name')?.trim()
  const identifier = queried || profile?.uuid || ''

  // Resolve a searched name to a uuid for the chart/feed.
  const { data: user } = useQuery({
    queryKey: ['user', identifier],
    queryFn: () => mcsr.getUser(identifier),
    enabled: !!identifier
  })
  const uuid = user?.uuid ?? (queried ? '' : profile?.uuid ?? '')

  return (
    <div className="mx-auto max-w-[980px] space-y-4 px-5 py-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-base uppercase tracking-[0.2em] text-muted">
          {queried ? 'Player' : 'Your profile'}
        </h1>
        <div className="w-60">
          <PlayerSearch />
        </div>
      </div>

      {identifier ? (
        <>
          <ProfileHero identifier={identifier} />
          {uuid && (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <EloChart uuid={uuid} />
              <div className="flex min-h-[280px] flex-col">
                <MatchFeed uuid={uuid} />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="surface grid h-40 place-items-center text-muted">Search for a player above.</div>
      )}
    </div>
  )
}
