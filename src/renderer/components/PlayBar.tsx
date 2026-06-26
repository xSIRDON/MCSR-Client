import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InstanceId } from '@shared/types'
import { useInstances, isBusy } from '../hooks/useInstances'
import { ModeBadge } from './ModeBadge'

const LABEL: Record<InstanceId, string> = { ranked: 'Ranked', rsg: 'RSG', zsg: 'ZSG' }
const INSTANCES: InstanceId[] = ['ranked', 'rsg', 'zsg']

function InstanceIcon({ id, size = 20 }: { id: InstanceId; size?: number }) {
  return <ModeBadge mode={id} size={size} />
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
        {/* instance selector — dropdown that opens upward */}
        <InstanceSelect selected={selected} onSelect={select} />

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

/** A compact dropdown for the active instance. Opens upward so it clears the footer. */
function InstanceSelect({ selected, onSelect }: { selected: InstanceId; onSelect: (id: InstanceId) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Move focus into the menu on open, starting at the selected item.
  useEffect(() => {
    if (!open) return
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    items?.[Math.max(0, INSTANCES.indexOf(selected))]?.focus()
  }, [open, selected])

  function onMenuKey(e: React.KeyboardEvent) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (!items.length) return
    const cur = items.findIndex((el) => el === document.activeElement)
    const go = (i: number) => {
      e.preventDefault()
      items[(i + items.length) % items.length].focus()
    }
    if (e.key === 'ArrowDown') go(cur + 1)
    else if (e.key === 'ArrowUp') go(cur - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-w-[148px] items-center gap-2 rounded-xl border bg-[var(--bg-2)] px-3 py-2 text-sm transition-colors"
        style={{
          color: 'var(--win)',
          borderColor: open ? 'rgba(74,255,140,0.5)' : 'var(--line)'
        }}
      >
        <InstanceIcon id={selected} />
        <span className="font-display tracking-wide">{LABEL[selected]}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden
          className={`ml-auto text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        // The menu clears the page via PlayBar's own z-20 (its backdrop-blur makes a
        // stacking context); this z-40 only orders it within that context.
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKey}
          className="absolute bottom-full left-0 z-40 mb-2 w-[184px] overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[#0e0e16] p-1 shadow-[0_14px_44px_rgba(0,0,0,.6)] animate-fade-up"
        >
          {INSTANCES.map((id) => {
            const active = selected === id
            return (
              <button
                key={id}
                role="menuitem"
                aria-current={active || undefined}
                onClick={() => {
                  onSelect(id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.07]"
                style={{
                  color: active ? 'var(--win)' : 'var(--text)',
                  background: active ? 'rgba(74,255,140,0.12)' : undefined
                }}
              >
                <InstanceIcon id={id} />
                <span className="font-display tracking-wide">{LABEL[id]}</span>
                {active && (
                  <svg className="ml-auto" width="13" height="13" viewBox="0 0 14 14" aria-hidden>
                    <path
                      d="M2.5 7.5l3 3 6-7"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
