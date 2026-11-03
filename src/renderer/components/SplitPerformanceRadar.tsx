import { useMemo, useState } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer
} from 'recharts'
import { splitBreakdown, splitPerformance, strongestWeakest } from '@core/ranked-analytics'
import type { SplitBreakdown, SplitPerf } from '@core/ranked-analytics'
import type { MatchInfo } from '@services/mcsr-ranked'
import { msToTime } from '@core/format'
import { BUCKETS } from '../lib/baseline'

function PerfTick(props: {
  x?: number
  y?: number
  cx?: number
  payload?: { value: string }
  perf?: Record<string, SplitPerf>
}) {
  const { x = 0, y = 0, cx = 0, payload, perf } = props
  const p = payload && perf ? perf[payload.value] : undefined
  const anchor = x > cx + 8 ? 'start' : x < cx - 8 ? 'end' : 'middle'
  const dx = anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0
  const pctColor = !p || p.pctLabel === '—' ? '#8b8b9e' : p.pctLabel.startsWith('Top') ? '#5fd38d' : '#e2706e'
  return (
    <g>
      <text x={x + dx} y={y - 5} textAnchor={anchor} fill="#cdcdd8" fontSize={12} className="font-display">
        {payload?.value}
      </text>
      <text x={x + dx} y={y + 10} textAnchor={anchor} fontSize={11}>
        <tspan fill="#8b8b9e">{p?.ms != null ? msToTime(p.ms) : '—'}</tspan>
        {p && p.pctLabel !== '—' ? <tspan fill={pctColor}> · {p.pctLabel}</tspan> : null}
      </text>
    </g>
  )
}

export function SplitPerformanceRadar({
  uuid,
  details,
  tierKey,
  tierLabel,
  loading,
  delay = 90
}: {
  uuid: string
  details: MatchInfo[]
  tierKey: string
  tierLabel: string
  loading: boolean
  delay?: number
}) {
  const hasTier = !!BUCKETS[tierKey]
  const [basis, setBasis] = useState<'world' | 'tier'>('world')
  const activeBasis = basis === 'tier' && hasTier ? 'tier' : 'world'
  const bucket = activeBasis === 'tier' ? BUCKETS[tierKey] : BUCKETS.world

  const perf = useMemo(() => splitPerformance(uuid, details, bucket), [uuid, details, bucket])
  const byLabel = useMemo(() => {
    const m: Record<string, SplitPerf> = {}
    for (const p of perf) m[p.label] = p
    return m
  }, [perf])
  const data = perf
    .filter((p) => p.score != null)
    .map((p) => ({ axis: p.label, score: p.score as number }))
  const rated = data.length
  const breakdown = useMemo(() => splitBreakdown(uuid, details), [uuid, details])
  const sw = strongestWeakest(perf)

  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <header className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">
          Split performance
        </h2>
        <div className="flex overflow-hidden rounded-lg border border-[var(--line)] text-[11px]">
          {(['world', 'tier'] as const).map((b) => {
            const on = activeBasis === b
            const disabled = b === 'tier' && !hasTier
            return (
              <button
                key={b}
                disabled={disabled}
                onClick={() => setBasis(b)}
                title={disabled ? 'Not enough data for this tier yet' : undefined}
                className="px-2.5 py-1 font-medium transition-colors disabled:opacity-40"
                style={{
                  color: on ? 'var(--gold)' : 'var(--muted)',
                  background: on ? 'rgba(245,200,66,0.12)' : 'transparent'
                }}
              >
                {b === 'world' ? 'World' : tierLabel || 'My Tier'}
              </button>
            )
          })}
        </div>
      </header>
      {rated < 3 ? (
        <div className="grid h-[300px] place-items-center text-center text-sm text-muted">
          {loading ? 'Loading split data…' : 'Not enough split data in recent matches yet.'}
        </div>
      ) : (
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="60%" margin={{ top: 24, right: 62, bottom: 24, left: 62 }}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="axis" tick={<PerfTick perf={byLabel} />} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="score"
                stroke="#9f6bff"
                fill="#9f6bff"
                fillOpacity={0.28}
                isAnimationActive
                animationDuration={600}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
      {rated >= 3 && (
        <>
          <p className="text-center text-xs text-faint">
            {breakdown.games} games ({breakdown.completions} completions) analyzed · times are averages,
            ranked against other players' averages
          </p>
          {sw && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ExtremeSplit title="Strongest split" p={sw.strongest} color="#5fd38d" />
              <ExtremeSplit title="Weakest split" p={sw.weakest} color="#e2706e" />
            </div>
          )}
          <BreakdownTable b={breakdown} />
        </>
      )}
    </section>
  )
}

function ExtremeSplit({ title, p, color }: { title: string; p: SplitPerf; color: string }) {
  return (
    <div className="surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted">{title}</div>
      <div className="mt-0.5 text-sm text-text">
        {p.label} <span className="tnum text-muted">{p.ms != null ? msToTime(p.ms) : '—'}</span>
      </div>
      <div className="text-xs" style={{ color }}>
        {p.pctLabel}
      </div>
    </div>
  )
}

const SHORT: Record<string, string> = {
  overworld: 'OW',
  nether: 'Neth',
  bastion: 'Bast',
  fortress: 'Fort',
  blind: 'Blind',
  stronghold: 'SH',
  end: 'End'
}

function rateText(rate: number | null): string {
  if (rate == null) return '—'
  const share = rate * 100
  return share < 10 ? `${share.toFixed(1)}%` : `${Math.round(share)}%`
}

function BreakdownTable({ b }: { b: SplitBreakdown }) {
  const rows: { label: string; hint: string; cell: (r: SplitBreakdown['rows'][number]) => string }[] = [
    { label: 'Runs', hint: 'games that finished the split', cell: (r) => String(r.reached) },
    { label: 'Deaths', hint: 'per game that got to the split', cell: (r) => rateText(r.deathRate) },
    { label: 'Opp. deaths', hint: 'opponents, same games', cell: (r) => rateText(r.oppDeathRate) }
  ]
  return (
    <table className="mt-3 w-full table-fixed text-center text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
          <th className="w-[76px]" />
          {b.rows.map((r) => (
            <th key={r.key} className="pb-1 font-medium">
              {SHORT[r.key] ?? r.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="odd:bg-white/[0.02]">
            <td className="py-1 pl-1 text-left text-muted" title={row.hint}>
              {row.label}
            </td>
            {b.rows.map((r) => (
              <td key={r.key} className="tnum py-1 text-text">
                {row.cell(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
