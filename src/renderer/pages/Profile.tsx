import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { ProfileHero } from '../components/ProfileHero'
import { EloChart } from '../components/EloChart'
import { MatchFeed } from '../components/MatchFeed'
import { RsgStats } from '../components/RsgStats'
import { PlayerSearch } from '../components/PlayerSearch'
import { PlayStyleRadar } from '../components/PlayStyleRadar'
import { SplitPerformanceRadar } from '../components/SplitPerformanceRadar'
import { SeasonPicker } from '../components/SeasonPicker'
import { usePlayerAnalytics } from '../hooks/usePlayerAnalytics'
import type { SeasonSel } from '../hooks/usePlayerAnalytics'

export function Profile() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const profile = useUi((s) => s.profile)
  const pacemanName = useUi((s) => s.pacemanName)
  const queried = params.get('name')?.trim()
  const identifier = queried || profile?.uuid || ''
  const [tab, setTab] = useState<'ranked' | 'rsg'>('ranked')
  const [seasonSel, setSeasonSel] = useState<SeasonSel>(undefined)

  // Resolve a searched name to a uuid for the chart/feed; nickname drives paceman.
  const { data: user, isError: noRankedProfile } = useQuery({
    queryKey: ['user', identifier],
    queryFn: () => mcsr.getUser(identifier),
    enabled: !!identifier
  })
  const displayName = queried || profile?.name || identifier
  const uuid = user?.uuid ?? (queried ? '' : profile?.uuid ?? '')
  // RSG stats look a player up by name. For SEARCHED players the IGN is fine (public data);
  // for the signed-in player, respect the "Connect paceman" gate — pacemanName stays null
  // until they explicitly opt in, and their IGN must never silently surface paceman runs.
  const rsgName = queried ? (user?.nickname ?? queried) : pacemanName

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
          <ProfileHero identifier={identifier} name={displayName} season={seasonSel} />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex w-fit gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-1">
                <Tab active={tab === 'ranked'} onClick={() => setTab('ranked')} accent="var(--gold)">
                  Ranked
                </Tab>
                <Tab active={tab === 'rsg'} onClick={() => setTab('rsg')} accent="var(--portal)">
                  RSG
                </Tab>
              </div>
              {tab === 'ranked' && <SeasonPicker value={seasonSel} onChange={setSeasonSel} />}
            </div>
            {queried && profile?.name && user?.nickname && user.uuid !== profile.uuid && (
              <button
                onClick={() =>
                  navigate(
                    `/compare?p1=${encodeURIComponent(profile.name)}&p2=${encodeURIComponent(user.nickname)}`
                  )
                }
                className="font-display rounded-lg border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-3.5 py-1.5 text-sm tracking-wide text-[var(--gold)] transition-all hover:brightness-125"
              >
                Compare with me →
              </button>
            )}
          </div>

          {tab === 'ranked' ? (
            !noRankedProfile && uuid ? (
              <>
                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <EloChart uuid={uuid} season={seasonSel} />
                  <div className="flex min-h-[280px] flex-col">
                    <MatchFeed key={uuid} uuid={uuid} season={seasonSel} />
                  </div>
                </div>
                <ProfileAnalytics uuid={uuid} season={seasonSel} />
              </>
            ) : null
          ) : (
            <RsgStats name={rsgName} />
          )}
        </>
      ) : (
        <div className="surface grid h-40 place-items-center text-muted">Search for a player above.</div>
      )}
    </div>
  )
}

/** The same analytics radars the self-review uses, for whichever player is being viewed. */
function ProfileAnalytics({ uuid, season }: { uuid: string; season?: SeasonSel }) {
  const { scorecard, details, rank, detailsLoading, hasData } = usePlayerAnalytics(uuid, season)
  if (!hasData) return null
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PlayStyleRadar dims={scorecard} delay={110} />
      <SplitPerformanceRadar
        uuid={uuid}
        details={details}
        tierKey={rank.tier.toLowerCase()}
        tierLabel={rank.tier}
        loading={detailsLoading}
        delay={130}
      />
    </div>
  )
}

function Tab({
  active,
  accent,
  onClick,
  children
}: {
  active: boolean
  accent: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-4 py-1.5 font-display text-sm tracking-wide transition-all"
      style={{
        color: active ? accent : 'var(--muted)',
        background: active ? `${accent}14` : 'transparent',
        boxShadow: active ? `inset 0 0 0 1px ${accent}40` : undefined
      }}
    >
      {children}
    </button>
  )
}
