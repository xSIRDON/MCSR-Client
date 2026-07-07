import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import {
  useFavorites,
  useFriendsPresence,
  useFriendsNet,
  useMutualPresence,
  normUuid
} from '../hooks/useFriends'
import type { FriendPresence } from '../hooks/useFriends'
import { PlayerHead } from './PlayerHead'
import { PlayerAutocomplete } from './PlayerAutocomplete'

type Tab = 'friends' | 'watchlist'

const STATUS_COLOR: Record<FriendPresence['status'], string> = {
  ranked: 'var(--gold)',
  pace: '#9f6bff',
  online: 'var(--win)',
  offline: 'var(--faint)'
}

/** Epic-style rail: two tabs — Friends (mutual, requests) and Watchlist (starred) — each with a
 *  live counter of who's in a MCSR match or on an RSG world right now. */
export function FriendsRail() {
  const open = useUi((s) => s.friendsOpen)
  const setOpen = useUi((s) => s.setFriendsOpen)
  const [tab, setTab] = useState<Tab>('friends')

  const { friends: watchlist, inGame: watchLive } = useFriendsPresence()
  const net = useFriendsNet()
  const { rows: mutuals, inGame: friendsLive } = useMutualPresence(net)
  const requests = net.incoming.length
  const totalLive = watchLive + friendsLive

  if (!open) {
    const preview = [...mutuals, ...watchlist].slice(0, 8)
    return (
      <aside className="flex w-[52px] shrink-0 flex-col items-center border-l border-[var(--line)] bg-black/25 py-3">
        <button
          onClick={() => setOpen(true)}
          title="Friends"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
        >
          <FriendsIcon />
          {requests > 0 ? (
            <Badge color="var(--gold)">{requests}</Badge>
          ) : totalLive > 0 ? (
            <Badge color="var(--win)">{totalLive}</Badge>
          ) : null}
        </button>
        <div className="mt-2 flex flex-col items-center gap-1.5">
          {preview.map((f) => (
            <button key={f.uuid} onClick={() => setOpen(true)} title={`${f.nickname} — ${f.detail}`} className="relative">
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
      <header className="flex items-center gap-1 border-b border-[var(--line)] px-2 py-2">
        <TabButton active={tab === 'friends'} onClick={() => setTab('friends')} label="Friends" live={friendsLive} dot={requests} />
        <TabButton active={tab === 'watchlist'} onClick={() => setTab('watchlist')} label="Watchlist" live={watchLive} />
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
        {tab === 'friends' ? (
          <FriendsList net={net} mutuals={mutuals} />
        ) : (
          <WatchlistList watchlist={watchlist} />
        )}
      </div>

      <AddBox tab={tab} canFriend={net.connected} />
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

function TabButton({
  active,
  onClick,
  label,
  live,
  dot = 0
}: {
  active: boolean
  onClick: () => void
  label: string
  live: number
  dot?: number
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-display text-[11px] uppercase tracking-[0.12em] transition-colors"
      style={{
        color: active ? 'var(--gold)' : 'var(--muted)',
        background: active ? 'rgba(245,200,66,0.12)' : 'transparent'
      }}
    >
      {label}
      {live > 0 && (
        <span
          className="tnum inline-flex items-center gap-1 rounded-full px-1.5 text-[9px] not-italic"
          style={{ background: 'rgba(74,255,140,.16)', color: 'var(--win)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--win)] animate-pulse-glow" />
          {live}
        </span>
      )}
      {dot > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[var(--gold)] px-1 text-[8px] text-[#0a0a10]">
          {dot}
        </span>
      )}
    </button>
  )
}

function FriendsList({
  net,
  mutuals
}: {
  net: ReturnType<typeof useFriendsNet>
  mutuals: FriendPresence[]
}) {
  if (!net.connected) {
    return (
      <div className="px-2 py-6 text-center text-[11px] leading-relaxed text-faint">
        {net.error ? 'Friends network unavailable right now.' : 'Connecting to the friends network…'}
      </div>
    )
  }
  const empty = mutuals.length === 0 && net.incoming.length === 0 && net.outgoing.length === 0
  return (
    <div className="space-y-0.5">
      {net.incoming.map((r) => (
        <RequestRow key={r.uuid} uuid={normUuid(r.uuid)} nickname={r.nickname} />
      ))}
      {mutuals.map((f) => (
        <PresenceRow key={f.uuid} f={f} onRemove={(u) => void window.mcsr.friends.remove(u)} />
      ))}
      {net.outgoing.map((r) => (
        <div key={r.uuid} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 opacity-60">
          <PlayerHead id={normUuid(r.uuid)} uuid={normUuid(r.uuid)} size={30} className="rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-muted">{r.nickname || 'Unknown runner'}</div>
            <div className="text-[11px] text-faint">Request pending…</div>
          </div>
          <button
            onClick={() => void window.mcsr.friends.remove(normUuid(r.uuid))}
            title="Cancel request"
            className="shrink-0 text-faint hover:text-[var(--loss)]"
          >
            <XIcon />
          </button>
        </div>
      ))}
      {empty && (
        <div className="px-2 py-6 text-center text-[11px] leading-relaxed text-faint">
          No friends yet — open a player's profile and hit Add friend, or search below.
        </div>
      )}
    </div>
  )
}

function WatchlistList({ watchlist }: { watchlist: FriendPresence[] }) {
  const { toggle } = useFavorites()
  return (
    <div className="space-y-0.5">
      {watchlist.length === 0 ? (
        <div className="px-2 py-6 text-center text-[11px] leading-relaxed text-faint">
          Star runners from their profile — or search below — to follow their games here.
        </div>
      ) : (
        watchlist.map((f) => <PresenceRow key={f.uuid} f={f} onRemove={(u) => void toggle(u)} />)
      )}
    </div>
  )
}

function RequestRow({ uuid, nickname }: { uuid: string; nickname: string }) {
  return (
    <div className="mb-0.5 flex items-center gap-2.5 rounded-lg bg-[var(--gold)]/10 px-2 py-1.5 ring-1 ring-inset ring-[var(--gold)]/25">
      <PlayerHead id={uuid} uuid={uuid} size={30} className="rounded-md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-text">{nickname || 'Unknown runner'}</div>
        <div className="text-[11px] text-[var(--gold)]">Friend request</div>
      </div>
      <button
        onClick={() => void window.mcsr.friends.accept(uuid)}
        title="Accept"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--win)]/15 text-[var(--win)] transition-all hover:brightness-125"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5L4.8 9 10 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        onClick={() => void window.mcsr.friends.decline(uuid)}
        title="Decline"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--loss)]/15 text-[var(--loss)] transition-all hover:brightness-125"
      >
        <XIcon />
      </button>
    </div>
  )
}

/** A run clock that counts up locally from a fetched anchor — no per-second network fetching. */
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

function PresenceRow({ f, onRemove }: { f: FriendPresence; onRemove: (uuid: string) => void }) {
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

/** Bottom search box — sends a friend request on the Friends tab, adds to the watchlist otherwise. */
function AddBox({ tab, canFriend }: { tab: Tab; canFriend: boolean }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const { favorites, toggle } = useFavorites()

  const friendMode = tab === 'friends'
  if (friendMode && !canFriend) return null

  async function submit(name: string) {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    setErr(false)
    try {
      const user = await mcsr.getUser(n)
      if (friendMode) {
        await window.mcsr.friends.request(normUuid(user.uuid), user.nickname)
      } else if (!favorites.includes(normUuid(user.uuid))) {
        await toggle(user.uuid)
      }
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
        placeholder={
          err ? 'Player not found' : friendMode ? 'Add a friend by name…' : 'Add a player to your watchlist…'
        }
        dropUp
        className={`w-full rounded-lg border bg-[var(--bg-2)] px-3 py-1.5 text-xs text-text outline-none transition-colors placeholder:text-faint ${
          err
            ? 'border-[var(--loss)]/50 placeholder:text-[var(--loss)]'
            : 'border-[var(--line)] focus:border-[var(--gold)]/40'
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

function FriendsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="6" cy="6.5" r="2.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="6.5" r="2.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 15a4 4 0 018 0M8 15a4 4 0 018 0" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
