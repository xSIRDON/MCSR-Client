import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InstanceId } from '@shared/types'
import { useUi } from '../store/uiStore'
import { useInstances, isBusy } from '../hooks/useInstances'
import { ProgressBar } from './ProgressBar'
import { ObsidianBlock, PortalBlock } from './BlockArt'

interface Meta {
  title: string
  tagline: string
  accent: string
  mods: string
  icon: () => JSX.Element
}

const META: Record<InstanceId, Meta> = {
  ranked: {
    title: 'Ranked',
    tagline: '1v1 ladder — the full MCSR Ranked modpack.',
    accent: 'var(--gold)',
    mods: '22 mods · MCSR Ranked',
    icon: () => <ObsidianBlock size={20} />
  },
  rsg: {
    title: 'RSG',
    tagline: 'Random Seed Glitchless — SeedQueue wall + paceman. No ranked mod.',
    accent: 'var(--portal)',
    mods: 'SeedQueue · SpeedRunIGT · paceman',
    icon: () => <PortalBlock size={20} />
  }
}

export function InstanceCard({ id }: { id: InstanceId }) {
  const meta = META[id]
  const navigate = useNavigate()
  const profile = useUi((s) => s.profile)
  const { statuses, progress, init, launch, verify, select } = useInstances()
  useEffect(() => init(), [init])

  const status = statuses[id]
  const prog = progress[id]
  const busy = isBusy(status.state)

  const stateLabel =
    status.state === 'running'
      ? 'Running'
      : status.state === 'launching'
        ? 'Launching…'
        : status.state === 'installing'
          ? 'Installing…'
          : status.state === 'ready'
            ? 'Ready'
            : status.state === 'error'
              ? 'Error'
              : 'Not installed'

  return (
    <div
      className="surface relative flex flex-col overflow-hidden p-4"
      style={{ boxShadow: `inset 0 0 50px ${meta.accent}0a, 0 8px 26px rgba(0,0,0,.5)` }}
      onMouseEnter={() => select(id)}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full blur-3xl"
        style={{ background: meta.accent, opacity: 0.1 }}
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {meta.icon()}
          <h3 className="font-display text-lg" style={{ color: meta.accent }}>
            {meta.title}
          </h3>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px]"
          style={{
            color: status.state === 'error' ? 'var(--loss)' : meta.accent,
            border: `1px solid ${status.state === 'error' ? 'var(--loss)' : meta.accent}40`
          }}
        >
          {stateLabel}
        </span>
      </div>

      <div className="relative mt-1 text-xs text-faint">{meta.mods}</div>
      <p className="relative mt-2 text-sm text-muted">{meta.tagline}</p>

      <div className="relative mt-3 min-h-[34px]">
        {busy && prog ? (
          <ProgressBar fraction={prog.fraction} label={prog.message} color={meta.accent} />
        ) : status.state === 'error' ? (
          <div className="text-xs text-[var(--loss)]">{status.error ?? 'Something went wrong.'}</div>
        ) : status.versionId ? (
          <div className="text-xs text-faint">Pack {status.versionId}</div>
        ) : null}
      </div>

      <div className="relative mt-3 flex items-center gap-2">
        <button
          onClick={() => launch(id)}
          disabled={!profile || busy}
          className="font-display flex-1 rounded-lg px-4 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: meta.accent, color: '#0a0a10' }}
        >
          {status.state === 'running' ? 'PLAYING' : busy ? 'WORKING…' : status.state === 'ready' ? 'PLAY' : 'INSTALL'}
        </button>
        <button
          onClick={() => verify(id)}
          disabled={busy}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-40"
          title="Re-download and verify all files"
        >
          Verify
        </button>
        <button
          onClick={() => navigate(`/instance/${id}`)}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-muted transition-colors hover:text-text"
          title="Mods, RAM, game settings, folder"
        >
          Manage
        </button>
      </div>

      {id === 'rsg' && (
        <button
          onClick={() => window.obsidian.config.pickJar()}
          className="relative mt-2.5 text-left text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
        >
          Use my own SeedQueue jar (Discord beta)…
        </button>
      )}
    </div>
  )
}
