import { useEffect, useState } from 'react'
import type { InstanceId, InstanceStatus, ProgressEvent } from '@shared/types'
import { useUi } from '../store/uiStore'
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
    icon: () => <ObsidianBlock size={22} />
  },
  rsg: {
    title: 'RSG',
    tagline: 'Random Seed Glitchless — SeedQueue wall, paceman pace. No ranked mod.',
    accent: 'var(--portal)',
    mods: 'SeedQueue · SpeedRunIGT · paceman',
    icon: () => <PortalBlock size={22} />
  }
}

const BUSY: InstanceStatus['state'][] = ['installing', 'launching', 'running']

export function InstanceCard({ id }: { id: InstanceId }) {
  const meta = META[id]
  const profile = useUi((s) => s.profile)
  const [status, setStatus] = useState<InstanceStatus>({ id, state: 'not-installed' })
  const [progress, setProgress] = useState<ProgressEvent | null>(null)

  useEffect(() => {
    let active = true
    void window.obsidian.instances.status(id).then((s) => active && setStatus(s))
    const offState = window.obsidian.instances.onStateChanged((s) => {
      if (s.id === id) {
        setStatus(s)
        if (!BUSY.includes(s.state)) setProgress(null)
      }
    })
    const offProg = window.obsidian.instances.onProgress((e) => {
      if (e.instance === id) setProgress(e)
    })
    return () => {
      active = false
      offState()
      offProg()
    }
  }, [id])

  const busy = BUSY.includes(status.state)
  const canPlay = !!profile && !busy

  async function play() {
    try {
      await window.obsidian.instances.launch(id)
    } catch (e) {
      setStatus((s) => ({ ...s, state: 'error', error: String(e) }))
    }
  }

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
      className="surface relative flex flex-col overflow-hidden p-6"
      style={{ boxShadow: `inset 0 0 60px ${meta.accent}0a, 0 10px 34px rgba(0,0,0,.5)` }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
        style={{ background: meta.accent, opacity: 0.1 }}
      />
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3">
          {meta.icon()}
          <div>
            <h3 className="font-display text-xl" style={{ color: meta.accent }}>
              {meta.title}
            </h3>
            <div className="text-xs text-faint">{meta.mods}</div>
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px]"
          style={{
            color: status.state === 'error' ? 'var(--loss)' : meta.accent,
            border: `1px solid ${status.state === 'error' ? 'var(--loss)' : meta.accent}40`
          }}
        >
          {stateLabel}
        </span>
      </div>

      <p className="relative mt-3 text-sm text-muted">{meta.tagline}</p>

      <div className="relative mt-5 min-h-[42px]">
        {busy && progress ? (
          <ProgressBar fraction={progress.fraction} label={progress.message} color={meta.accent} />
        ) : status.state === 'error' ? (
          <div className="text-xs text-[var(--loss)]">{status.error ?? 'Something went wrong.'}</div>
        ) : status.versionId ? (
          <div className="text-xs text-faint">Pack {status.versionId}</div>
        ) : null}
      </div>

      <div className="relative mt-4 flex items-center gap-2">
        <button
          onClick={play}
          disabled={!canPlay}
          className="font-display flex-1 rounded-lg px-4 py-2.5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: meta.accent, color: '#0a0a10', boxShadow: `0 6px 20px ${meta.accent}40` }}
        >
          {status.state === 'running' ? 'PLAYING' : busy ? 'WORKING…' : status.state === 'ready' ? 'PLAY' : 'INSTALL & PLAY'}
        </button>
        <button
          onClick={() => window.obsidian.instances.verify(id)}
          disabled={busy}
          className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm text-muted transition-colors hover:text-text disabled:opacity-40"
          title="Re-download and verify all files"
        >
          Verify
        </button>
      </div>

      {id === 'rsg' && (
        <button
          onClick={() => window.obsidian.config.pickJar()}
          className="relative mt-3 text-left text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
        >
          Use my own SeedQueue jar (Discord beta)…
        </button>
      )}

      {!profile && <div className="relative mt-3 text-xs text-[var(--gold)]">Sign in to play.</div>}
    </div>
  )
}
