import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: string
}

export function StatTile({ label, value, hint, accent }: Props) {
  return (
    <div className="min-w-0 border-l border-[var(--line)] pl-3 first:border-l-0 first:pl-0">
      <div className="truncate text-[11px] text-muted">{label}</div>
      <div className="tnum mt-1.5 truncate text-lg leading-none" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint != null && <div className="mt-1.5 truncate text-[11px] text-faint">{hint}</div>}
    </div>
  )
}
