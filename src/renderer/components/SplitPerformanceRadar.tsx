import { useMemo, useState } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer
} from 'recharts'
import { splitPerformance } from '@core/ranked-analytics'
import type { SplitPerf } from '@core/ranked-analytics'
import type { MatchInfo } from '@services/mcsr-ranked'
import { msToTime } from '@core/format'
import { BUCKETS } from '../lib/baseline'

/** Custom polar-axis label: split name + the player's time + Top/Bottom % (colored). */
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

/** Split Performance radar — each segment ranked (Top/Bottom %) vs a baseline, World or the player's tier. */
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
  // Only plot splits the player actually has data for. Coalescing a null score to 0 would collapse
  // that spoke to the polygon centre — the visual encoding for worst-possible — misrepresenting a
  // no-data split (very common: `end` needs a win) as bottom-of-field, contradicting its '—' label.
  const data = perf
    .filter((p) => p.score != null)
    .map((p) => ({ axis: p.label, score: p.score as number }))
  const rated = data.length

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
    </section>
  )
}
