import { signedElo } from '@core/format'
import { StatTile } from './StatTile'
import type { HeadStats } from '../hooks/usePlayerAnalytics'

export function StatRow({ head }: { head: HeadStats }) {
  const decided = head.wins + head.losses
  const winRate = decided > 0 ? Math.round((head.wins / decided) * 1000) / 10 : 0
  const netColor = head.netElo > 0 ? 'var(--win)' : head.netElo < 0 ? 'var(--loss)' : undefined

  return (
    <section className="surface grid grid-cols-2 gap-y-4 px-5 py-4 sm:grid-cols-4">
      <StatTile label="Win rate" value={`${winRate}%`} hint={`${head.played} played`} accent="var(--gold)" />
      <StatTile label="Record" value={`${head.wins}–${head.losses}`} />
      <StatTile
        label="Elo"
        value={head.elo != null ? String(head.elo) : '—'}
        hint={`${signedElo(head.netElo)} recent`}
        accent={netColor}
      />
      <StatTile
        label="Win streak"
        value={head.currentStreak > 0 ? `${head.currentStreak}W` : '—'}
        hint={`best ${head.bestStreak}W`}
      />
    </section>
  )
}
