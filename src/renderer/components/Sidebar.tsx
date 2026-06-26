import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { AccountMenu } from './AccountMenu'

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/play', label: 'Play', icon: PlayIcon, end: false },
  { to: '/console', label: 'Console', icon: ConsoleIcon, end: false },
  { to: '/profile', label: 'Profile', icon: UserIcon, end: false },
  { to: '/settings', label: 'Settings', icon: GearIcon, end: false }
]

/** Compact icon rail, à la a real Minecraft launcher. */
export function Sidebar() {
  const profile = useUi((s) => s.profile)
  const { data: user } = useQuery({
    queryKey: ['user', profile?.uuid],
    queryFn: () => mcsr.getUser(profile!.uuid),
    enabled: !!profile
  })
  const rank = eloToRank(user?.eloRate)

  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center border-r border-[var(--line)] bg-black/25 py-3">
      <nav className="flex w-full flex-col items-center gap-1 px-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) =>
              `group relative flex h-[54px] w-full flex-col items-center justify-center gap-1 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'bg-[var(--gold)]/[0.13] text-[var(--gold)]'
                  : 'text-muted hover:bg-white/[0.06] hover:text-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-[-8px] top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--gold)]" />
                )}
                <Icon />
                <span className="text-[10px] font-medium tracking-[0.03em]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2.5">
        <div className="h-px w-7 bg-[var(--line)]" />
        {profile && (
          <div
            className="rounded-lg p-0.5"
            style={{ boxShadow: `0 0 0 1.5px ${rank.color}66, 0 0 12px ${rank.glow}33` }}
          >
            <AccountMenu profile={profile} />
          </div>
        )}
      </div>
    </aside>
  )
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <path d="M3 8l6-5 6 5v6a1 1 0 01-1 1h-3v-4H7v4H4a1 1 0 01-1-1V8z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <path d="M5 3.5l9 5.5-9 5.5v-11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
function ConsoleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.5 7l2 1.6-2 1.6M9.5 11h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 15a5.5 5.5 0 0111 0" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M9 2v2M9 14v2M2 9h2M14 9h2M4 4l1.5 1.5M12.5 12.5L14 14M14 4l-1.5 1.5M5.5 12.5L4 14"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  )
}
