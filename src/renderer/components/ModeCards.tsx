import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { mcsr, paceman } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { msToTime } from '@core/format'
import { useInstances, isBusy } from '../hooks/useInstances'
import type { ProgressEvent } from '@shared/types'
import { RankBadge } from './RankBadge'
import { ModeBadge } from './ModeBadge'

/** RANKED — gold/dark. Just the Elo and a one-tap launch; deeper stats live on the profile. */
export function RankedCard({ uuid, delay = 0 }: { uuid: string; delay?: number }) {
  const { data: user } = useQuery({ queryKey: ['user', uuid], queryFn: () => mcsr.getUser(uuid) })
  const { statuses, progress, launch } = useInstances()
  const status = statuses.ranked
  const prog = progress.ranked
  const busy = isBusy(status.state)

  const rank = eloToRank(user?.eloRate)

  return (
    <ModeShell accent={rank.color} glow={rank.glow} delay={delay}>
      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ModeBadge mode="ranked" size={28} />
          <div className="min-w-0">
            <div className="font-display text-lg leading-none tracking-wide text-[var(--gold)]">RANKED</div>
            <div className="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-faint">1v1 Ladder</div>
          </div>
        </div>
        <RankBadge elo={user?.eloRate} size="sm" />
      </header>

      <Hero label="Elo" value={user?.eloRate ?? '—'} color={rank.color} glow={`${rank.glow}66`} />

      <PlayButton
        busy={busy}
        progress={prog}
        label={launchLabel(status.state, 'PLAY RANKED')}
        onClick={() => void launch('ranked')}
      />
    </ModeShell>
  )
}

/** RSG — nether-portal purple. Personal best, a live RUNNING/IDLE badge, and a one-tap launch. */
export function RsgCard({ name, delay = 0 }: { name: string | null; delay?: number }) {
  const { data: runs } = useQuery({
    queryKey: ['rsg-card', name],
    queryFn: () => paceman.getRecentRuns(name!, { limit: 50, hours: 24 * 365 }),
    enabled: !!name
  })
  const { data: liveRuns } = useQuery({
    queryKey: ['rsg-card-live', name],
    queryFn: () => paceman.getRecentRuns(name!, { limit: 1 }),
    enabled: !!name,
    refetchInterval: 5000
  })
  const liveRun = liveRuns?.[0]
  const { data: world } = useQuery({
    queryKey: ['rsg-card-world', liveRun?.id],
    queryFn: () => paceman.getWorld(liveRun!.id),
    enabled: !!liveRun,
    refetchInterval: 5000
  })
  const isLive = !!world?.isLive

  const { statuses, progress, launch } = useInstances()
  const status = statuses.rsg
  const prog = progress.rsg
  const busy = isBusy(status.state)

  const finished = runs?.filter((r) => r.finish != null) ?? []
  const pb = finished.length ? Math.min(...finished.map((r) => r.finish as number)) : null

  return (
    <ModeShell accent="var(--portal)" glow="var(--portal)" delay={delay}>
      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ModeBadge mode="rsg" size={28} />
          <div className="min-w-0">
            <div className="font-display text-lg leading-none tracking-wide text-[var(--portal)]">RSG</div>
            <div className="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-faint">Random Seed Glitchless</div>
          </div>
        </div>
        <StatusPill live={isLive} />
      </header>

      <Hero label="Personal best" value={pb != null ? msToTime(pb) : '—'} color="var(--portal)" glow="rgba(159,107,255,.5)" />

      <PlayButton
        busy={busy}
        progress={prog}
        label={launchLabel(status.state, 'PLAY RSG')}
        onClick={() => void launch('rsg')}
      />
    </ModeShell>
  )
}

/** ZSG — teal. The RSG mod set plus the FSG (filtered-seed) mod. No tracked stats. */
export function ZsgCard({ delay = 0 }: { delay?: number }) {
  const { statuses, progress, launch } = useInstances()
  const status = statuses.zsg
  const prog = progress.zsg
  const busy = isBusy(status.state)

  return (
    <ModeShell accent="#4fd6b0" glow="#4fd6b0" delay={delay}>
      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ModeBadge mode="zsg" size={28} />
          <div className="min-w-0">
            <div className="font-display text-lg leading-none tracking-wide" style={{ color: '#4fd6b0' }}>
              ZSG
            </div>
            <div className="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-faint">Filtered seed practice</div>
          </div>
        </div>
        <StatusPill live={false} />
      </header>

      <div className="relative flex flex-1 flex-col justify-center py-3">
        <p className="text-sm leading-relaxed text-muted">
          RSG set + the <span className="text-text">FSG</span> filtered-seed mod.
        </p>
      </div>

      <PlayButton
        busy={busy}
        progress={prog}
        label={launchLabel(status.state, 'PLAY ZSG')}
        onClick={() => void launch('zsg')}
      />
    </ModeShell>
  )
}

// ---- shared kit ----

function launchLabel(state: string, ready: string): string {
  return state === 'running'
    ? 'PLAYING'
    : state === 'launching'
      ? 'LAUNCHING…'
      : state === 'installing'
        ? 'INSTALLING…'
        : state === 'ready'
          ? ready
          : 'INSTALL & PLAY'
}

/** The single hero stat each card centers on (Elo / PB). */
function Hero({ label, value, color, glow }: { label: string; value: ReactNode; color: string; glow: string }) {
  return (
    <div className="relative flex flex-1 flex-col justify-center py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</div>
      <div
        className="font-display tnum whitespace-nowrap text-5xl leading-none"
        style={{ color, textShadow: `0 0 34px ${glow}` }}
      >
        {value}
      </div>
    </div>
  )
}

/** RSG live indicator — pulses green while a run is live, otherwise a quiet IDLE chip. */
function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${
        live ? 'animate-pulse-glow' : ''
      }`}
      style={{
        color: live ? 'var(--win)' : 'var(--faint)',
        background: live ? 'rgba(74,255,140,.12)' : 'transparent',
        border: `1px solid ${live ? 'rgba(74,255,140,.3)' : 'var(--line)'}`
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: live ? 'var(--win)' : 'var(--faint)' }} />
      {live ? 'RUNNING' : 'IDLE'}
    </span>
  )
}

function ModeShell({
  accent,
  glow,
  delay,
  children
}: {
  accent: string
  glow: string
  delay: number
  children: ReactNode
}) {
  return (
    <section
      className="surface group relative flex min-h-[208px] flex-col overflow-hidden p-4 animate-fade-up"
      style={{
        animationDelay: `${delay}ms`,
        boxShadow: `0 12px 44px rgba(0,0,0,.5), inset 0 0 70px ${accent}0d`
      }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: glow, opacity: 0.16 }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px,#fff 1px,transparent 0)', backgroundSize: '7px 7px' }}
      />
      <div className="relative flex flex-1 flex-col">{children}</div>
    </section>
  )
}

function PlayButton({
  busy,
  progress,
  label,
  onClick
}: {
  busy: boolean
  progress: ProgressEvent | null
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="font-display relative mt-auto w-full overflow-hidden rounded-xl px-5 py-2.5 text-base tracking-wide transition-all hover:brightness-110 disabled:cursor-not-allowed"
      style={{
        color: '#07140a',
        background: busy
          ? 'linear-gradient(180deg,#3a4a36,#2c3a2a)'
          : 'linear-gradient(180deg,#6fcf57,#4ea73e)',
        boxShadow: busy
          ? 'none'
          : '0 8px 24px rgba(94,167,62,.4), inset 0 1px 0 rgba(255,255,255,.25)',
        opacity: busy ? 0.85 : 1
      }}
    >
      {busy && progress?.fraction != null && (
        <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${progress.fraction * 100}%` }} />
      )}
      <span className="relative flex items-center justify-center gap-2.5">
        {!busy && (
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
            <path d="M3 2.5l8 4.5-8 4.5v-9z" fill="currentColor" />
          </svg>
        )}
        {busy && progress?.message ? <span className="truncate text-sm">{progress.message}</span> : label}
      </span>
    </button>
  )
}
