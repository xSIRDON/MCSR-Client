import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InstanceId } from '@shared/types'
import { useInstances, isBusy } from '../hooks/useInstances'
import { NetheriteBlock, PortalBlock } from './BlockArt'

const LABEL: Record<InstanceId, string> = { ranked: 'Ranked', rsg: 'RSG', zsg: 'ZSG' }
const ACCENT: Record<InstanceId, string> = {
  ranked: 'var(--gold)',
  rsg: 'var(--portal)',
  zsg: '#4fd6b0'
}

export function PlayBar() {
  const navigate = useNavigate()
  const { selected, statuses, progress, select, init, launch } = useInstances()
  useEffect(() => init(), [init])

  const status = statuses[selected]
  const prog = progress[selected]
  const busy = isBusy(status.state)

  const playLabel =
    status.state === 'running'
      ? 'PLAYING'
      : status.state === 'launching'
        ? 'LAUNCHING'
        : status.state === 'installing'
          ? 'INSTALLING'
          : status.state === 'ready'
            ? 'PLAY'
            : 'INSTALL & PLAY'

  return (
    <div className="relative z-20 shrink-0 border-t border-[var(--line)] bg-[#0b0b11]/95 backdrop-blur">
      {/* download bar across the top edge while busy */}
      {busy && (
        <div className="absolute -top-px left-0 right-0 h-[3px] overflow-hidden">
          <div
            className="h-full"
            style={{
              width: prog?.fraction != null ? `${Math.round(prog.fraction * 100)}%` : '100%',
              background: 'var(--win)',
              boxShadow: '0 0 10px var(--win)',
              opacity: prog?.fraction != null ? 1 : 0.7,
              animation: prog?.fraction == null ? 'sheen 1.2s ease-in-out infinite' : undefined,
              transition: 'width .25s'
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-4 px-5 py-3">
        {/* instance selector */}
        <div className="flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-1">
          {(['ranked', 'rsg', 'zsg'] as InstanceId[]).map((id) => {
            const active = selected === id
            return (
              <button
                key={id}
                onClick={() => select(id)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all"
                style={{
                  color: active ? ACCENT[id] : 'var(--muted)',
                  background: active ? `${ACCENT[id]}14` : 'transparent',
                  boxShadow: active ? `inset 0 0 0 1px ${ACCENT[id]}40` : undefined
                }}
              >
                {id === 'ranked' ? <NetheriteBlock size={16} /> : <PortalBlock size={16} />}
                <span className="font-display tracking-wide">{LABEL[id]}</span>
              </button>
            )
          })}
        </div>

        {/* status line */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-text">
            {busy && prog ? prog.message : status.state === 'error' ? (status.error ?? 'Error') : LABEL[selected]}
          </div>
          <div className="truncate text-xs text-faint">
            {status.state === 'ready'
              ? `Installed${status.versionId ? ` · ${status.versionId}` : ''}`
              : status.state === 'not-installed'
                ? 'Not installed — first launch downloads everything'
                : status.state === 'running'
                  ? 'Game is running'
                  : status.state === 'error'
                    ? 'Tap Verify on the Play page to repair'
                    : 'Working…'}
          </div>
        </div>

        {/* edit + folder + play */}
        <button
          onClick={() => navigate(`/instance/${selected}`)}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-muted transition-colors hover:text-text"
          title="Java, RAM, mods, settings"
        >
          Edit instance
        </button>
        <button
          onClick={() => void window.mcsr.instances.openFolder(selected)}
          className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[var(--line)] text-muted transition-colors hover:text-text"
          title="Open the installed game folder"
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path
              d="M2.5 5.5A1.5 1.5 0 014 4h2.8l1.4 1.6H14A1.5 1.5 0 0115.5 7v6A1.5 1.5 0 0114 14.5H4A1.5 1.5 0 012.5 13V5.5z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={() => launch(selected)}
          disabled={busy}
          className="font-display group relative flex min-w-[190px] items-center justify-center gap-2.5 rounded-xl px-6 py-3 text-base tracking-wide transition-all disabled:cursor-not-allowed"
          style={{
            color: '#07140a',
            background: busy
              ? 'linear-gradient(180deg,#3a4a36,#2c3a2a)'
              : 'linear-gradient(180deg,#6fcf57,#4ea73e)',
            boxShadow: busy ? 'none' : '0 8px 24px rgba(94,167,62,.4), inset 0 1px 0 rgba(255,255,255,.25)',
            opacity: busy ? 0.85 : 1
          }}
        >
          {!busy && (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M3 2.5l8 4.5-8 4.5v-9z" fill="currentColor" />
            </svg>
          )}
          {playLabel}
        </button>
      </div>
    </div>
  )
}
