// The mcsrranked-style match card: a Splits ⇄ Timestamps toggle over one match's timeline.
// Timestamps lists each player's milestones (and death/reset markers) at their absolute time
// with the head-to-head delta between the two; Splits shows per-segment durations side by side.
import { useState } from 'react'
import type { MatchInfo } from '@services/mcsr-ranked'
import { matchBreakdown } from '@core/ranked-analytics'
import type { MatchBreakdown as Breakdown, MatchEvent } from '@core/ranked-analytics'

/** Bare m:ss (milliseconds dropped) — the compact form the site uses on match cards. */
function mmss(ms: number | null): string {
  if (ms == null || ms < 0) return '—'
  const t = Math.floor(ms / 1000)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
/** Signed m:ss for a delta ('-' = the left player is ahead/faster). */
function signed(delta: number): string {
  return (delta < 0 ? '-' : '+') + mmss(Math.abs(delta))
}

type View = 'timestamps' | 'splits'

export function MatchBreakdownCard({
  match,
  meUuid,
  meName,
  oppUuid,
  oppName
}: {
  match: MatchInfo
  meUuid: string
  meName: string
  oppUuid: string
  oppName: string
}) {
  const [view, setView] = useState<View>('timestamps')
  const bd = matchBreakdown(match, meUuid, oppUuid)

  // Clicks inside the card must not bubble up to the row header (which toggles the row shut).
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  if (bd.aEvents.length === 0 && bd.bEvents.length === 0) {
    return (
      <div className="px-3 py-3 text-xs text-faint" onClick={stop}>
        No timeline recorded for this match.
      </div>
    )
  }

  return (
    <div className="px-3 py-3" onClick={stop}>
      <div className="mb-3 flex justify-center">
        <div className="inline-flex rounded-lg border border-[var(--line)] p-0.5 text-xs">
          {(['splits', 'timestamps'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 capitalize transition-colors ${
                view === v ? 'bg-white/[0.08] text-text' : 'text-muted hover:text-text'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {view === 'timestamps' ? (
        <Timestamps bd={bd} meName={meName} oppName={oppName} />
      ) : (
        <Splits bd={bd} meName={meName} oppName={oppName} />
      )}
    </div>
  )
}

function ColHead({ name, className = '' }: { name: string; className?: string }) {
  return (
    <div className={`mb-1.5 truncate font-medium text-text ${className}`} title={name}>
      {name}
    </div>
  )
}

function EventItem({ e }: { e: MatchEvent }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="tnum w-9 shrink-0 text-text">{mmss(e.ms)}</span>
      <span className={e.milestone ? 'truncate text-muted' : 'truncate italic text-faint'}>
        {e.label}
      </span>
    </li>
  )
}

/** Three independent columns: my events · milestone deltas · opponent's events. */
function Timestamps({ bd, meName, oppName }: { bd: Breakdown; meName: string; oppName: string }) {
  const deltas = bd.timestamps.filter((r) => r.delta != null)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 text-xs">
      <div className="min-w-0">
        <ColHead name={meName} />
        <ul className="space-y-1">
          {bd.aEvents.map((e) => (
            <EventItem key={e.key} e={e} />
          ))}
        </ul>
      </div>

      <div className="px-1">
        <div className="mb-1.5 text-center text-[10px] uppercase tracking-wider text-faint">vs</div>
        <ul className="space-y-1">
          {deltas.map((r) => (
            <li key={r.key} className="whitespace-nowrap text-center">
              <span className="text-faint">{r.label} </span>
              <span
                className="tnum"
                style={{ color: r.delta! < 0 ? 'var(--win)' : 'var(--loss)' }}
              >
                {signed(r.delta!)}
              </span>
            </li>
          ))}
          {deltas.length === 0 && <li className="text-center text-faint">—</li>}
        </ul>
      </div>

      <div className="min-w-0">
        <ColHead name={oppName} />
        <ul className="space-y-1">
          {bd.bEvents.map((e) => (
            <EventItem key={e.key} e={e} />
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Aligned grid of per-segment durations, faster side tinted. */
function Splits({ bd, meName, oppName }: { bd: Breakdown; meName: string; oppName: string }) {
  return (
    <div className="text-xs">
      <div className="mb-1.5 grid grid-cols-[1fr_auto_1fr] gap-x-3 font-medium text-text">
        <span className="truncate" title={meName}>
          {meName}
        </span>
        <span className="text-center text-[10px] uppercase tracking-wider text-faint">split</span>
        <span className="truncate text-right" title={oppName}>
          {oppName}
        </span>
      </div>
      <ul className="space-y-1">
        {bd.segments.map((r) => {
          const aFast = r.delta != null && r.delta < 0
          const bFast = r.delta != null && r.delta > 0
          return (
            <li key={r.key} className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-3">
              <span className="tnum" style={{ color: aFast ? 'var(--win)' : 'var(--text)' }}>
                {mmss(r.aMs)}
              </span>
              <span className="whitespace-nowrap text-center text-faint">
                {r.label}
                {r.delta != null && (
                  <span
                    className="tnum ml-1.5"
                    style={{ color: r.delta < 0 ? 'var(--win)' : 'var(--loss)' }}
                  >
                    {signed(r.delta)}
                  </span>
                )}
              </span>
              <span
                className="tnum text-right"
                style={{ color: bFast ? 'var(--win)' : 'var(--text)' }}
              >
                {mmss(r.bMs)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
