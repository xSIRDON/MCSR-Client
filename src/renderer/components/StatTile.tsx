import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: string
  delay?: number
}

export function StatTile({ label, value, hint, accent, delay = 0 }: Props) {
  return (
    <div
      className="surface-2 animate-count px-4 py-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</div>
      <div
        className="font-display tnum mt-1 text-2xl leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint != null && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  )
}
