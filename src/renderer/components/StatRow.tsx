import { msToTime, signedElo } from '@core/format'
import { StatTile } from './StatTile'
import type { HeadStats } from '../hooks/usePlayerAnalytics'

/** The review's headline stat tiles: record, elo, best/average time, streak. */
export function StatRow({ head, scope = 'season' }: { head: HeadStats; scope?: 'season' | 'total' }) {
  const decided = head.wins + head.losses
  const winRate = decided > 0 ? Math.round((head.wins / decided) * 1000) / 10 : 0
  const netColor = head.netElo > 0 ? 'var(--win)' : head.netElo < 0 ? 'var(--loss)' : undefined
  const streakColor = head.currentStreak > 0 ? 'var(--win)' : undefined

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile
        label="Win Rate"
        value={`${winRate}%`}
        hint={`${head.wins}W · ${head.losses}L`}
        accent="var(--gold)"
        delay={20}
      />
      <StatTile
        label="Record"
        value={`${head.wins}–${head.losses}`}
        hint={`${head.played} played`}
        delay={50}
      />
      <StatTile
        label="Elo"
        value={head.elo != null ? String(head.elo) : '—'}
        hint={`${signedElo(head.netElo)} recent`}
        accent={netColor}
        delay={80}
      />
      <StatTile
        label="Best Time"
        value={msToTime(head.bestTime)}
        hint={scope === 'total' ? 'career best' : 'season best'}
        accent="var(--portal)"
        delay={110}
      />
      <StatTile
        label="Avg Win"
        value={head.averageWin != null ? msToTime(head.averageWin) : '—'}
        hint="recent completions"
        delay={140}
      />
      <StatTile
        label="Win Streak"
        value={head.currentStreak > 0 ? `${head.currentStreak}W` : '—'}
        hint={`best ${head.bestStreak}W`}
        accent={streakColor}
        delay={170}
      />
    </div>
  )
}
