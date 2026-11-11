import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useNavigate } from 'react-router-dom'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { useFavorites, useWatchlist, normUuid } from '../hooks/useWatchlist'
import type { RunnerPresence } from '../hooks/useWatchlist'
import { PlayerHead } from './PlayerHead'
import { PlayerAutocomplete } from './PlayerAutocomplete'

const STATUS_COLOR: Record<RunnerPresence['status'], string> = {
  ranked: 'var(--gold)',
  pace: '#9f6bff',
  online: 'var(--win)',
  offline: 'var(--faint)'
}

export function WatchlistRail() {
  const open = useUi((s) => s.railOpen)
  const setOpen = useUi((s) => s.setRailOpen)
  const { runners, inGame } = useWatchlist()

  if (!open) {
    return (
      <aside className="flex w-[52px] shrink-0 flex-col items-center border-l border-[var(--line)] bg-black/25 py-3">
        <button
          onClick={() => setOpen(true)}
          title="Watchlist"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
        >
          <Icon name="watchlist" />
          {inGame > 0 && <Badge color="var(--win)">{inGame}</Badge>}
        </button>
        <div className="mt-2 flex flex-col items-center gap-1.5">
          {runners.slice(0, 8).map((f) => (
            <button key={f.uuid} onClick={() => setOpen(true)} title={`${f.nickname}: ${f.detail}`} className="relative">
              <PlayerHead id={f.uuid} uuid={f.uuid} size={26} className="rounded-md opacity-90 transition-opacity hover:opacity-100" />
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[#0d0d14]"
                style={{ background: STATUS_COLOR[f.status] }}
              />
            </button>
          ))}
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-l border-[var(--line)] bg-black/25">
      <header className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <span className="font-display text-[11px] text-[var(--gold)]">Watchlist</span>
        {inGame > 0 && <span className="tnum text-[10px] text-[var(--win)]">{inGame} playing</span>}
        <button
          onClick={() => setOpen(false)}
          title="Collapse"
          className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded text-muted hover:bg-white/[0.06] hover:text-text"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M4 2.5L8 6l-4 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <WatchlistList watchlist={runners} />
      </div>

      <AddBox />
    </aside>
  )
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 font-display text-[9px] text-[#0a0a10]"
      style={{ background: color }}
    >
      {children}
    </span>
  )
}

function WatchlistList({ watchlist }: { watchlist: RunnerPresence[] }) {
  const { toggle } = useFavorites()
  return (
    <div className="space-y-0.5">
      {watchlist.length === 0 ? (
        <div className="px-2 py-6 text-center text-[11px] leading-relaxed text-faint">
          Star runners from their profile, or search below, to follow their games here.
        </div>
      ) : (
        watchlist.map((f) => <PresenceRow key={f.uuid} f={f} onRemove={(u) => void toggle(u)} />)
      )}
    </div>
  )
}

function LiveTimer({ base, anchor }: { base: number; anchor: number }) {
  const [, bump] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => bump((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const s = Math.max(0, Math.floor((base + (Date.now() - anchor)) / 1000))
  return (
    <span className="tnum">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

function PresenceRow({
  f,
  onRemove
}: {
  f: RunnerPresence
  onRemove: (uuid: string) => void
}) {
  const navigate = useNavigate()
  const inGame = f.status === 'ranked' || f.status === 'pace'
  return (
    <div
      className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
      style={inGame ? { background: `${STATUS_COLOR[f.status]}0d` } : undefined}
    >
      <button onClick={() => navigate(`/profile?name=${encodeURIComponent(f.nickname)}`)} className="relative shrink-0" title="Open profile">
        <PlayerHead id={f.uuid} uuid={f.uuid} size={30} className="rounded-md" />
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#101018]"
          style={{ background: STATUS_COLOR[f.status] }}
        />
      </button>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => navigate(`/profile?name=${encodeURIComponent(f.nickname)}`)}
          className="block max-w-full truncate text-left text-sm text-text hover:underline"
        >
          {f.nickname}
        </button>
        <div className="truncate text-[11px]" style={{ color: inGame ? STATUS_COLOR[f.status] : 'var(--faint)' }}>
          {f.detail}
          {f.live && (
            <>
              {' · '}
              <LiveTimer base={f.live.base} anchor={f.live.anchor} />
            </>
          )}
        </div>
      </div>
      {f.liveUrl && (
        <a
          href={f.liveUrl}
          target="_blank"
          rel="noreferrer"
          title="Watch on Twitch"
          className="shrink-0 rounded-md border border-[#9146ff]/40 bg-[#9146ff]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#b88aff] transition-all hover:brightness-125"
        >
          LIVE
        </a>
      )}
      <button
        onClick={() => onRemove(f.uuid)}
        title="Remove"
        className="hidden shrink-0 text-faint transition-colors hover:text-[var(--loss)] group-hover:block"
      >
        <XIcon />
      </button>
    </div>
  )
}

function AddBox() {
  const [q, setQ] = useState('')
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const { favorites, toggle } = useFavorites()

  async function submit(name: string) {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    setErr(false)
    try {
      const user = await mcsr.getUser(n)
      if (!favorites.includes(normUuid(user.uuid))) await toggle(user.uuid)
      setQ('')
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-[var(--line)] p-2.5">
      <PlayerAutocomplete
        value={q}
        onChange={(v) => {
          setQ(v)
          setErr(false)
        }}
        onSubmit={(name) => void submit(name)}
        placeholder={err ? 'Player not found' : 'Add a player to your watchlist…'}
        dropUp
        className={`w-full rounded-lg border bg-[var(--bg-2)] px-3 py-1.5 text-xs text-text outline-none transition-colors placeholder:text-faint ${
          err ? 'border-[var(--loss)]/50 placeholder:text-[var(--loss)]' : 'border-[var(--line)] focus:border-[var(--gold)]/40'
        }`}
      />
    </div>
  )
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

