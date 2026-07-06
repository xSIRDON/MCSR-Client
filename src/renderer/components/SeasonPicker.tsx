import { useCurrentSeason } from '../hooks/usePlayerAnalytics'
import type { SeasonSel } from '../hooks/usePlayerAnalytics'

/**
 * Season selector — undefined means "current season", 'all' means career totals.
 * Numbered options run from the current season (leaderboard metadata) back to season 1.
 */
export function SeasonPicker({
  value,
  onChange
}: {
  value: SeasonSel
  onChange: (season: SeasonSel) => void
}) {
  const current = useCurrentSeason()
  if (!current) return null
  const seasons = Array.from({ length: current }, (_, i) => current - i)
  const active = value === 'all' ? 'all' : String(value ?? current)
  return (
    <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">
      Season
      <select
        value={active}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'all') onChange('all')
          else {
            const n = Number(v)
            onChange(n === current ? undefined : n)
          }
        }}
        className="cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-2 py-1 font-display text-sm normal-case tracking-normal text-text outline-none transition-colors hover:border-[var(--gold)]/40"
      >
        <option value="all">All · career</option>
        {seasons.map((n) => (
          <option key={n} value={String(n)}>
            {n === current ? `${n} · current` : n}
          </option>
        ))}
      </select>
    </label>
  )
}
