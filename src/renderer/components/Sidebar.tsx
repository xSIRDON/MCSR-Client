import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { PlayerHead } from './PlayerHead'

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/play', label: 'Play', icon: PlayIcon, end: false },
  { to: '/profile', label: 'Profile', icon: UserIcon, end: false },
  { to: '/settings', label: 'Settings', icon: GearIcon, end: false }
]

export function Sidebar() {
  const profile = useUi((s) => s.profile)
  const { data: user } = useQuery({
    queryKey: ['user', profile?.uuid],
    queryFn: () => mcsr.getUser(profile!.uuid),
    enabled: !!profile
  })
  const rank = eloToRank(user?.eloRate)

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[var(--line)] bg-black/20 px-3 py-4">
      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--gold)]/10 text-[var(--gold)] ring-1 ring-[var(--gold)]/25'
                  : 'text-muted hover:bg-white/5 hover:text-text'
              }`
            }
          >
            <Icon />
            <span className="font-medium tracking-wide">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        {profile && (
          <div className="surface-2 flex items-center gap-3 p-2.5">
            <PlayerHead id={profile.uuid} uuid={profile.uuid} size={36} className="rounded-md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text">{profile.name}</div>
              <div className="font-display text-xs" style={{ color: rank.color }}>
                {user?.eloRate ?? '—'} <span className="text-faint">elo</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 8l6-5 6 5v6a1 1 0 01-1 1h-3v-4H7v4H4a1 1 0 01-1-1V8z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M5 3.5l9 5.5-9 5.5v-11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 15a5.5 5.5 0 0111 0" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M9 2v2M9 14v2M2 9h2M14 9h2M4 4l1.5 1.5M12.5 12.5L14 14M14 4l-1.5 1.5M5.5 12.5L4 14"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  )
}
