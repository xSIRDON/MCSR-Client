import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: string
  delay?: number
}

export function StatTile({ label, value, hint, accent, delay = 0 }: Props) {
  // Long values (a "11:55.296" time in a six-across grid) shrink so they never
  // overflow the tile; short values (elo, win rate) keep the full size.
  const len = typeof value === 'string' ? value.length : 0
  const sizeClass = len > 8 ? 'text-lg' : len > 6 ? 'text-xl' : 'text-2xl'
  return (
    <div
      className="surface-2 animate-count px-4 py-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</div>
      <div
        className={`font-display tnum mt-1 whitespace-nowrap leading-none ${sizeClass}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint != null && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  )
}
