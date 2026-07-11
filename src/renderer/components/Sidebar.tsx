import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { AccountMenu } from './AccountMenu'

/** Nav in scannable groups: play the game / study the numbers / run the app. */
const NAV_GROUPS: { to: string; label: string; icon: () => JSX.Element; end?: boolean }[][] = [
  [
    { to: '/', label: 'Home', icon: HomeIcon, end: true },
    { to: '/play', label: 'Play', icon: PlayIcon }
  ],
  [
    { to: '/leaderboard', label: 'Leaders', icon: LeaderboardIcon },
    { to: '/review', label: 'Review', icon: ReviewIcon },
    { to: '/compare', label: 'Compare', icon: CompareIcon },
    { to: '/practice', label: 'Practice', icon: TargetIcon }
  ],
  [
    { to: '/console', label: 'Console', icon: ConsoleIcon },
    { to: '/profile', label: 'Profile', icon: UserIcon },
    { to: '/settings', label: 'Settings', icon: GearIcon }
  ]
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
      <nav className="flex w-full flex-col items-center px-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="flex w-full flex-col items-center gap-0.5">
            {gi > 0 && <div className="my-2 h-px w-6 bg-[var(--line)]" />}
            {group.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={label}
                className={({ isActive }) =>
                  `group relative flex h-[50px] w-full flex-col items-center justify-center gap-[3px] rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-[var(--gold)]'
                      : 'text-muted hover:bg-white/[0.05] hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <>
                        {/* soft gold wash + hairline ring, glow bleeding off the left edge */}
                        <span
                          className="absolute inset-0 rounded-xl"
                          style={{
                            background:
                              'linear-gradient(90deg, rgba(245,200,66,0.16), rgba(245,200,66,0.05))',
                            boxShadow: 'inset 0 0 0 1px rgba(245,200,66,0.22)'
                          }}
                        />
                        <span className="absolute left-[-8px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--gold)] shadow-[0_0_8px_rgba(245,200,66,0.8)]" />
                      </>
                    )}
                    <span
                      className={`relative transition-transform duration-200 ${
                        isActive ? '' : 'group-hover:-translate-y-[1px]'
                      }`}
                      style={
                        isActive
                          ? { filter: 'drop-shadow(0 0 5px rgba(245,200,66,0.55))' }
                          : undefined
                      }
                    >
                      <Icon />
                    </span>
                    <span
                      className={`relative text-[9px] tracking-[0.06em] transition-opacity duration-200 ${
                        isActive ? 'font-semibold' : 'opacity-70 group-hover:opacity-100'
                      }`}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2.5 pt-3">
        <div className="h-px w-6 bg-[var(--line)]" />
        {profile && (
          <div
            className="rounded-lg p-0.5 transition-shadow duration-300 hover:shadow-[0_0_16px_rgba(245,200,66,0.25)]"
            style={{ boxShadow: `0 0 0 1.5px ${rank.color}66, 0 0 12px ${rank.glow}33` }}
          >
            <AccountMenu profile={profile} />
          </div>
        )}
        <div className="font-display text-[9px] tracking-wide text-faint/70" title="MCSR Client version">
          v{__APP_VERSION__}
        </div>
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
function LeaderboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="9" width="3.4" height="6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="7.3" y="4" width="3.4" height="11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="12.1" y="11" width="3.4" height="4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
function CompareIcon() {
  // Two bars facing off across a center line — a head-to-head, distinct from the friends icon.
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <path d="M9 2.5v13" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 1.6" />
      <path d="M6.5 5.5L2.5 9l4 3.5M11.5 5.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ReviewIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <path d="M3 3v12h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 11l3-3 2.4 2L15 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function TargetIcon() {
  // A target — "practice / close the gap to the best".
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="9" cy="9" r="0.6" fill="currentColor" />
    </svg>
  )
}
