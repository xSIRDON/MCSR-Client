import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { eloToRank } from '@core/rank'
import { AccountMenu } from './AccountMenu'
import { Icon, type IconName } from './Icon'

interface Item {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

const NAV: Item[][] = [
  [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/play', label: 'Play', icon: 'play' }
  ],
  [
    { to: '/leaderboard', label: 'Leaders', icon: 'trophy' },
    { to: '/review', label: 'Review', icon: 'chart' },
    { to: '/compare', label: 'Compare', icon: 'swords' },
    { to: '/practice', label: 'Practice', icon: 'target' }
  ],
  [
    { to: '/console', label: 'Console', icon: 'console' },
    { to: '/profile', label: 'Profile', icon: 'profile' },
    { to: '/settings', label: 'Settings', icon: 'settings' }
  ]
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
    <aside className="flex w-[76px] shrink-0 flex-col items-center border-r border-[var(--line)] bg-black/25 py-3">
      <nav className="flex w-full flex-col items-center px-1.5">
        {NAV.map((group, i) => (
          <div key={i} className="flex w-full flex-col items-center gap-0.5">
            {i > 0 && <div className="my-1.5 h-px w-6 bg-[var(--line)]" />}
            {group.map(({ to, label, icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex h-[46px] w-full flex-col items-center justify-center gap-1 rounded-[3px] ${
                    isActive ? 'nav-on text-[var(--gold)]' : 'text-muted hover:bg-white/[0.04] hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={icon} className={isActive ? undefined : 'opacity-60'} />
                    <span className="text-[10px] font-medium leading-none">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2 pt-3">
        {profile && (
          <div className="rounded-md p-0.5" style={{ boxShadow: `0 0 0 1.5px ${rank.color}88` }}>
            <AccountMenu profile={profile} />
          </div>
        )}
        <div className="text-[10px] text-muted" title="MCSR Client version">
          {__APP_VERSION__}
        </div>
      </div>
    </aside>
  )
}
