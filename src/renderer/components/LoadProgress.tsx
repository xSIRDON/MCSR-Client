export interface LoadPart {
  total: number
  done: number
  pending: boolean
}

export function isLoading(parts: LoadPart[]): boolean {
  return parts.some((p) => p.pending || p.done < p.total)
}

export function LoadProgress({ parts, label }: { parts: LoadPart[]; label: string }) {
  if (!isLoading(parts)) return null
  const total = parts.reduce((s, p) => s + p.total, 0)
  const done = parts.reduce((s, p) => s + Math.min(p.done, p.total), 0)
  const known = total > 0 && !parts.some((p) => p.pending)
  const pct = known ? Math.round((done / total) * 100) : 0

  return (
    <div className="surface px-4 py-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? pct : undefined}>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[11px]">
        <span className="uppercase tracking-[0.16em] text-muted">{label}</span>
        <span className="tnum text-faint">
          {known ? `${done} / ${total} matches · ${pct}%` : 'Finding matches…'}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-sm bg-white/[0.06]">
        {known ? (
          <div className="h-full bg-[var(--gold)] transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        ) : (
          <div className="load-sweep absolute inset-y-0 w-1/3 bg-[var(--gold)]/70" />
        )}
      </div>
      <div className="mt-1.5 text-[10px] text-faint">
        The first look at a player downloads each match once; after that it's saved and loads instantly.
      </div>
    </div>
  )
}
