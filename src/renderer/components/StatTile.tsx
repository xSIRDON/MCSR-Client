import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: string
}

export function StatTile({ label, value, hint, accent }: Props) {
  const len = typeof value === 'string' ? value.length : 0
  const sizeClass = len > 8 ? 'text-lg' : len > 6 ? 'text-xl' : 'text-2xl'
  return (
    <div className="surface-2 px-4 py-3">
      <div className="text-[11px] text-muted">{label}</div>
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
