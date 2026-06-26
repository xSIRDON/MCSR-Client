import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { ProfileHero } from '../components/ProfileHero'
import { EloChart } from '../components/EloChart'
import { MatchFeed } from '../components/MatchFeed'
import { RsgStats } from '../components/RsgStats'
import { PlayerSearch } from '../components/PlayerSearch'

export function Profile() {
  const [params] = useSearchParams()
  const profile = useUi((s) => s.profile)
  const queried = params.get('name')?.trim()
  const identifier = queried || profile?.uuid || ''
  const [tab, setTab] = useState<'ranked' | 'rsg'>('ranked')

  // Resolve a searched name to a uuid for the chart/feed; nickname drives paceman.
  const { data: user } = useQuery({
    queryKey: ['user', identifier],
    queryFn: () => mcsr.getUser(identifier),
    enabled: !!identifier
  })
  const uuid = user?.uuid ?? (queried ? '' : profile?.uuid ?? '')
  const rsgName = user?.nickname ?? null

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

          <div className="flex w-fit gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-1">
            <Tab active={tab === 'ranked'} onClick={() => setTab('ranked')} accent="var(--gold)">
              Ranked
            </Tab>
            <Tab active={tab === 'rsg'} onClick={() => setTab('rsg')} accent="var(--portal)">
              RSG
            </Tab>
          </div>

          {tab === 'ranked' ? (
            uuid ? (
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                <EloChart uuid={uuid} />
                <div className="flex min-h-[280px] flex-col">
                  <MatchFeed uuid={uuid} />
                </div>
              </div>
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
