interface Props {
  /** 0..1, or null for indeterminate. */
  fraction: number | null
  label?: string
  color?: string
}

export function ProgressBar({ fraction, label, color = 'var(--gold)' }: Props) {
  const pct = fraction == null ? null : Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className="w-full">
      {label && <div className="mb-1.5 truncate text-xs text-muted">{label}</div>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#0f0f17] ring-1 ring-[var(--line)]">
        {pct == null ? (
          <div
            className="h-full w-1/3 rounded-full"
            style={{ background: color, animation: 'sheen 1.2s ease-in-out infinite', opacity: 0.8 }}
          />
        ) : (
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}` }}
          />
        )}
      </div>
    </div>
  )
}
