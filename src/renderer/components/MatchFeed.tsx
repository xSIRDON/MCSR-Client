import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mcsr, } from '../lib/clients'
import type { MatchInfo } from '@services/mcsr-ranked'
import { msToTime, signedElo, epochToAgo } from '@core/format'

const TYPE_LABEL: Record<number, string> = { 1: 'Casual', 2: 'Ranked', 3: 'Private', 4: 'Event' }
const PREVIEW = 5

type Outcome = 'win' | 'loss' | 'draw'

function outcomeOf(m: MatchInfo, uuid: string): Outcome {
  if (!m.result || m.result.uuid == null) return 'draw'
  return m.result.uuid === uuid ? 'win' : 'loss'
}

export function MatchFeed({ uuid }: { uuid: string }) {
  const [expanded, setExpanded] = useState(false)
  const { data: matches, isLoading } = useQuery({
    queryKey: ['matches', uuid],
    queryFn: () => mcsr.getMatches(uuid, { type: 2, count: 15 })
  })

  const all = matches ?? []
  const shown = expanded ? all : all.slice(0, PREVIEW)
  const hidden = all.length - PREVIEW

  return (
    <section className="surface flex flex-col p-5 animate-fade-up" style={{ animationDelay: '110ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">Recent matches</h2>
        {all.length > 0 && <span className="tnum text-xs text-faint">{all.length} ranked</span>}
      </header>
      <div className="space-y-1.5">
        {isLoading
          ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12" />)
          : !all.length
            ? <div className="grid h-24 place-items-center text-sm text-muted">No ranked matches yet.</div>
            : shown.map((m) => <Row key={m.id} m={m} uuid={uuid} />)}
      </div>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] py-2 text-xs text-muted transition-colors hover:bg-white/[0.03] hover:text-text"
        >
          {expanded ? 'Show less' : `Show ${hidden} more`}
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            aria-hidden
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path
              d="M2.5 4.5L6 8l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </section>
  )
}

function Row({ m, uuid }: { m: MatchInfo; uuid: string }) {
  const [open, setOpen] = useState(false)
  const outcome = outcomeOf(m, uuid)
  const opponent = m.players?.find((p) => p.uuid !== uuid)
  const mine = m.changes?.find((c) => c.uuid === uuid)
  const color = outcome === 'win' ? 'var(--win)' : outcome === 'loss' ? 'var(--loss)' : 'var(--muted)'
  const tag = outcome === 'win' ? 'WIN' : outcome === 'loss' ? 'LOSS' : 'DRAW'

  return (
    <div
      className="surface-2 cursor-pointer overflow-hidden transition-colors hover:bg-white/[0.03]"
      style={{ borderLeft: `3px solid ${color}` }}
      onClick={() => setOpen((o) => !o)}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="font-display w-12 text-xs" style={{ color }}>
          {tag}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-text">
            vs <span className="font-medium">{opponent?.nickname ?? '—'}</span>
          </div>
          <div className="text-xs text-faint">
            {TYPE_LABEL[m.type] ?? 'Match'} · {epochToAgo(m.date)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display tnum text-sm" style={{ color }}>
            {mine ? signedElo(mine.change) : '—'}
          </div>
          <div className="text-xs text-faint">{msToTime(m.result?.time ?? null)}</div>
        </div>
      </div>
      {open && (
        <div className="border-t border-[var(--line)] bg-black/20 px-3 py-2 text-xs text-muted">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span>Match #{m.id}</span>
            {m.category && <span>Category: {m.category}</span>}
            {m.forfeited && <span className="text-[var(--loss)]">Forfeited</span>}
            {mine?.eloRate != null && (
              <span>
                New elo: <span className="text-text">{mine.eloRate}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
