import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InstanceId } from '@shared/types'
import { useUi } from '../store/uiStore'
import { useInstances, isBusy } from '../hooks/useInstances'
import { ProgressBar } from './ProgressBar'
import { ModeBadge } from './ModeBadge'

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
    tagline: 'The 1v1 ladder with the full Ranked modpack.',
    accent: 'var(--gold)',
    mods: '22 mods · MCSR Ranked',
    icon: () => <ModeBadge mode="ranked" size={26} />
  },
  rsg: {
    title: 'RSG',
    tagline: 'Random seed glitchless with the SeedQueue wall and paceman.',
    accent: 'var(--portal)',
    mods: 'SeedQueue · SpeedRunIGT · paceman',
    icon: () => <ModeBadge mode="rsg" size={26} />
  },
  zsg: {
    title: 'ZSG',
    tagline: 'The RSG mods plus FSG for filtered seeds.',
    accent: '#4fd6b0',
    mods: 'SeedQueue · SpeedRunIGT · FSG',
    icon: () => <ModeBadge mode="zsg" size={26} />
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
      className="surface flex flex-col p-4"
      onMouseEnter={() => select(id)}
    >
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {meta.icon()}
          <h3 className="font-display text-lg" style={{ color: meta.accent }}>
            {meta.title}
          </h3>
        </div>
        <span
          className="shrink-0 text-[11px]"
          style={{
            color: status.state === 'error' ? 'var(--loss)' : 'var(--faint)'
          }}
        >
          {stateLabel}
        </span>
      </div>

      <div className="mt-1 truncate text-[11px] text-faint">{meta.mods}</div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{meta.tagline}</p>
      {id === 'rsg' && (
        <button
          onClick={() => window.mcsr.config.pickJar()}
          className="mt-2 text-left text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
        >
          Use my own SeedQueue jar…
        </button>
      )}

      <div className="mt-auto min-h-[34px] pt-3">
        {busy && prog ? (
          <ProgressBar fraction={prog.fraction} label={prog.message} color={meta.accent} />
        ) : status.state === 'error' ? (
          <div className="text-xs text-[var(--loss)]">{status.error ?? 'Something went wrong.'}</div>
        ) : status.versionId ? (
          <div className="text-xs text-faint">Pack {status.versionId}</div>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => launch(id)}
          disabled={!profile || busy}
          className="col-span-2 rounded-lg px-4 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: meta.accent, color: '#0a0a10' }}
        >
          {status.state === 'running' ? 'PLAYING' : busy ? 'WORKING…' : status.state === 'ready' ? 'PLAY' : 'INSTALL'}
        </button>
        <button
          onClick={() => verify(id)}
          disabled={busy}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-muted transition-colors hover:text-text disabled:opacity-40"
          title="Re-download and verify all files"
        >
          Verify
        </button>
        <button
          onClick={() => navigate(`/instance/${id}`)}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
          title="Mods, RAM, game settings, folder"
        >
          Manage
        </button>
      </div>
    </div>
  )
}
