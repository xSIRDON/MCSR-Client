import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { mcsr, paceman } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { msToTime } from '@core/format'
import { useInstances, isBusy } from '../hooks/useInstances'
import type { ProgressEvent } from '@shared/types'
import { RankBadge } from './RankBadge'
import { ModeBadge } from './ModeBadge'

export function RankedCard({ uuid }: { uuid: string }) {
  const { data: user } = useQuery({ queryKey: ['user', uuid], queryFn: () => mcsr.getUser(uuid) })
  const { statuses, progress, launch } = useInstances()
  const status = statuses.ranked
  const prog = progress.ranked
  const busy = isBusy(status.state)

  const rank = eloToRank(user?.eloRate)

  return (
    <ModeShell glow={rank.glow}>
      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ModeBadge mode="ranked" />
          <div className="min-w-0">
            <div className="font-display text-lg leading-none tracking-wide text-[var(--gold)]">RANKED</div>
            <div className="mt-1 truncate text-[10px] text-faint">1v1 Ladder</div>
          </div>
        </div>
        <RankBadge elo={user?.eloRate} size="sm" />
      </header>

      <Hero label="Elo" value={user?.eloRate ?? '—'} color={rank.color} />

      <PlayButton
        busy={busy}
        progress={prog}
        label={launchLabel(status.state, 'PLAY RANKED')}
        onClick={() => void launch('ranked')}
      />
    </ModeShell>
  )
}

export function RsgCard({ name }: { name: string | null }) {
  const navigate = useNavigate()
  const { data: pbData } = useQuery({
    queryKey: ['rsg-card-pb', name],
    queryFn: () => paceman.getPB(name!),
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
  const tracking = useTrackerRunning()

  const pb = pbData?.finish ?? null

  const pbValue: ReactNode =
    name == null ? (
      <button
        onClick={() => navigate('/settings')}
        className="font-display text-base font-normal tracking-wide text-faint transition-colors hover:text-[var(--portal)]"
      >
        Connect paceman →
      </button>
    ) : pb != null ? (
      msToTime(pb)
    ) : (
      '—'
    )

  return (
    <ModeShell glow="var(--portal)">
      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ModeBadge mode="rsg" />
          <div className="min-w-0">
            <div className="font-display text-lg leading-none tracking-wide text-[var(--portal)]">RSG</div>
            <div className="mt-1 truncate text-[10px] text-faint">Random seed</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {tracking && <TrackerPill />}
          <StatusPill live={isLive} />
        </div>
      </header>

      <Hero label="Personal best" value={pbValue} color="var(--portal)" />

      <PlayButton
        busy={busy}
        progress={prog}
        label={launchLabel(status.state, 'PLAY RSG')}
        onClick={() => void launch('rsg')}
      />
    </ModeShell>
  )
}

export function ZsgCard() {
  const { statuses, progress, launch } = useInstances()
  const status = statuses.zsg
  const prog = progress.zsg
  const busy = isBusy(status.state)

  return (
    <ModeShell glow="#4fd6b0">
      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ModeBadge mode="zsg" />
          <div className="min-w-0">
            <div className="font-display text-lg leading-none tracking-wide" style={{ color: '#4fd6b0' }}>
              ZSG
            </div>
            <div className="mt-1 truncate text-[10px] text-faint">Filtered seeds</div>
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

const BUSY_LABEL: Record<string, string> = {
  running: 'PLAYING',
  launching: 'LAUNCHING…',
  installing: 'INSTALLING…'
}

function launchLabel(state: string, ready: string): string {
  return BUSY_LABEL[state] ?? (state === 'ready' ? ready : 'INSTALL & PLAY')
}

function Hero({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  const len = typeof value === 'string' ? value.length : 0
  const sizeClass = len > 9 ? 'text-[1.9rem]' : len > 6 ? 'text-4xl' : 'text-5xl'
  return (
    <div className="relative flex flex-1 flex-col justify-center py-3">
      <div className="text-[10px] text-muted">{label}</div>
      <div
        className={`font-display tnum whitespace-nowrap leading-none ${sizeClass}`}
        style={{ color, textShadow: `0 0 34px ${color}66` }}
      >
        {value}
      </div>
    </div>
  )
}

function useTrackerRunning(): boolean {
  const [running, setRunning] = useState(false)
  useEffect(() => {
    void window.mcsr.paceman.status().then((s) => setRunning(s.running))
    return window.mcsr.paceman.onStatusChanged((s) => setRunning(s.running))
  }, [])
  return running
}

function TrackerPill() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        color: 'var(--portal)',
        background: 'rgba(91,159,240,.12)',
        border: '1px solid rgba(91,159,240,.3)'
      }}
      title="The paceman tracker is running and uploading your splits to paceman.gg"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--portal)' }} />
      TRACKING
    </span>
  )
}

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

function ModeShell({ glow, children }: { glow: string; children: ReactNode }) {
  return (
    <section className="surface group relative flex min-h-[208px] flex-col overflow-hidden p-4">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full opacity-[0.16] blur-3xl transition-opacity duration-500 group-hover:opacity-30"
        style={{ background: glow }}
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
      className="pbtn font-display relative mt-auto w-full overflow-hidden px-4 py-1.5 text-base tracking-wide"
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
