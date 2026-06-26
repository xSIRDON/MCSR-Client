import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { mcsr, paceman } from '../lib/clients'
import { seasonRanked } from '@services/mcsr-ranked'
import { eloToRank } from '@core/rank'
import { msToTime, winRate } from '@core/format'
import { useInstances, isBusy } from '../hooks/useInstances'
import type { ProgressEvent } from '@shared/types'
import { RankBadge } from './RankBadge'
import { NetheriteBlock, PortalBlock } from './BlockArt'

/** RANKED — gold/dark. Elo, rank, season form, and a one-tap launch. */
export function RankedCard({ uuid, delay = 0 }: { uuid: string; delay?: number }) {
  const { data: user } = useQuery({ queryKey: ['user', uuid], queryFn: () => mcsr.getUser(uuid) })
  const { statuses, progress, launch } = useInstances()
  const status = statuses.ranked
  const prog = progress.ranked
  const busy = isBusy(status.state)

  const rank = eloToRank(user?.eloRate)
  const stats = user ? seasonRanked(user) : null
  const decay = user?.timestamp?.nextDecay

  return (
    <ModeShell accent={rank.color} glow={rank.glow} delay={delay}>
      <header className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <NetheriteBlock size={22} />
          <div>
            <div className="font-display text-lg leading-none tracking-wide text-[var(--gold)]">RANKED</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-faint">1v1 Ladder</div>
          </div>
        </div>
        <RankBadge elo={user?.eloRate} size="sm" />
      </header>

      <div className="relative mt-4 flex items-end gap-4">
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Elo</div>
          <div
            className="font-display tnum text-6xl leading-none"
            style={{ color: rank.color, textShadow: `0 0 30px ${rank.glow}66` }}
          >
            {user?.eloRate ?? '—'}
          </div>
        </div>
        <div className="mb-1 grid flex-1 grid-cols-3 gap-2">
          <Mini label="Global" value={user?.eloRank ? `#${user.eloRank}` : '—'} />
          <Mini label="Win rate" value={stats ? `${winRate(stats.wins, stats.loses)}%` : '—'} />
          <Mini label="Streak" value={stats?.currentStreak ?? '—'} />
        </div>
      </div>

      {decay ? (
        <div className="relative mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--loss)]/30 bg-[var(--loss)]/10 px-2.5 py-1 text-xs text-[var(--loss)]">
          ⚠ ELO decay scheduled — play to reset it
        </div>
      ) : (
        <div className="relative mt-3 text-xs text-faint">
          {stats ? `${stats.wins}W · ${stats.loses}L · best ${msToTime(stats.bestTime)} this season` : ' '}
        </div>
      )}

      <PlayButton
        busy={busy}
        progress={prog}
        label={launchLabel(status.state, 'PLAY RANKED')}
        onClick={() => void launch('ranked')}
      />
    </ModeShell>
  )
}

/** RSG — nether-portal purple. PB, clutch, live pace, and a one-tap launch. */
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
  const shCount = runs?.filter((r) => r.stronghold != null).length ?? 0
  const clutch = shCount > 0 ? Math.round((finished.length / shCount) * 100) : null
  const tracked = runs?.length ?? 0

  return (
    <ModeShell accent="var(--portal)" glow="var(--portal)" delay={delay}>
      <header className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <PortalBlock size={22} />
          <div>
            <div className="font-display text-lg leading-none tracking-wide text-[var(--portal)]">RSG</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-faint">Random Seed Glitchless</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${isLive ? 'animate-pulse-glow' : ''}`}
          style={{
            color: isLive ? 'var(--win)' : 'var(--faint)',
            background: isLive ? 'rgba(74,255,140,.12)' : 'transparent',
            border: `1px solid ${isLive ? 'rgba(74,255,140,.3)' : 'var(--line)'}`
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: isLive ? 'var(--win)' : 'var(--faint)' }} />
          {isLive ? 'RUNNING' : 'IDLE'}
        </span>
      </header>

      <div className="relative mt-4 flex items-end gap-4">
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Personal best</div>
          <div
            className="font-display tnum text-6xl leading-none"
            style={{ color: 'var(--portal)', textShadow: '0 0 30px rgba(159,107,255,.5)' }}
          >
            {pb != null ? msToTime(pb) : '—'}
          </div>
        </div>
        <div className="mb-1 grid flex-1 grid-cols-3 gap-2">
          <Mini label="Clutch" value={clutch != null ? `${clutch}%` : '—'} />
          <Mini label="SH reached" value={shCount || '—'} />
          <Mini label="Runs" value={tracked || '—'} />
        </div>
      </div>

      <div className="relative mt-3 text-xs text-faint">
        {!name
          ? 'Sign in to track your RSG pace.'
          : tracked
            ? 'Clutch = runs you finish after reaching the stronghold.'
            : 'No paceman runs yet — launch RSG to start tracking.'}
      </div>

      <PlayButton
        busy={busy}
        progress={prog}
        label={launchLabel(status.state, 'PLAY RSG')}
        onClick={() => void launch('rsg')}
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
      className="surface group relative overflow-hidden p-5 animate-fade-up"
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
      <div className="relative">{children}</div>
    </section>
  )
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-black/20 px-2.5 py-1.5">
      <div className="font-display tnum text-sm text-text">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider text-faint">{label}</div>
    </div>
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
      className="font-display relative mt-4 w-full overflow-hidden rounded-xl px-5 py-3 text-base tracking-wide transition-all hover:brightness-110 disabled:cursor-not-allowed"
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
