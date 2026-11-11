import { useState, type ReactNode } from 'react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { msToTime } from '@core/format'
import { topLabel } from '@core/run-analysis'

export interface PerfItem {
  key: string
  label: string
  short: string
  ms: number | null
  count: number
  share: number | null
}

export interface DeathRow {
  count: number
  rate: number
}

export interface HeadToHead {
  median: Record<string, number | null>
  wins: Record<string, number>
  losses: Record<string, number>
}

const STEPS: [number, string][] = [
  [0.3, '#888888'],
  [0.5, '#b3c4c9'],
  [0.7, '#86b8db'],
  [0.9, '#50fe50'],
  [0.95, '#3f82ff'],
  [1.01, '#ffd700']
]
const shareColour = (share: number | null): string =>
  share == null ? '#8b8b9e' : (STEPS.find(([max]) => share <= max) ?? STEPS[STEPS.length - 1])[1]

function Tick(props: {
  x?: number
  y?: number
  cx?: number
  payload?: { value: string }
  items?: Record<string, PerfItem>
}) {
  const { x = 0, y = 0, cx = 0, payload, items } = props
  const p = payload && items ? items[payload.value] : undefined
  const anchor = x > cx + 8 ? 'start' : x < cx - 8 ? 'end' : 'middle'
  const dx = anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0
  return (
    <g>
      <text x={x + dx} y={y - 5} textAnchor={anchor} fill="#cdcdd8" fontSize={12} className="font-display">
        {payload?.value}
      </text>
      <text x={x + dx} y={y + 10} textAnchor={anchor} fontSize={11}>
        <tspan fill="#8b8b9e">{p?.ms != null ? msToTime(p.ms) : 'No data'}</tspan>
        {p?.share != null ? <tspan fill={shareColour(p.share)}> · {topLabel(p.share)}</tspan> : null}
      </text>
    </g>
  )
}

function gapText(ms: number): string {
  const a = Math.abs(ms)
  const s = a >= 10_000 || a % 1000 === 0 ? `${Math.round(a / 1000)}s` : `${(a / 1000).toFixed(1)}s`
  return ms === 0 ? 'even' : `${s} ${ms < 0 ? 'faster' : 'slower'}`
}

function rate(r: number): string {
  const p = r * 100
  return p === 0 ? '0%' : `${Number(p.toPrecision(2))}%`
}

export function RunPerformanceCard({
  title,
  description,
  items,
  countsLabel,
  deaths,
  oppDeaths,
  timesaves,
  timesaveKeys,
  loading
}: {
  title: string
  description: ReactNode
  items: PerfItem[]
  countsLabel: string
  deaths?: Record<string, DeathRow>
  oppDeaths?: Record<string, DeathRow>
  timesaves: HeadToHead
  timesaveKeys?: string[]
  loading: boolean
}) {
  const [tab, setTab] = useState<'performance' | 'timesaves'>('performance')
  const byLabel = Object.fromEntries(items.map((p) => [p.label, p]))
  const data = items.filter((p) => p.share != null).map((p) => ({ axis: p.label, score: (p.share as number) * 100 }))
  const rated = items.filter((p) => p.share != null && p.count > 0)
  const strongest = rated.length >= 2 ? rated.reduce((a, b) => ((b.share ?? 0) > (a.share ?? 0) ? b : a)) : null
  const weakest = rated.length >= 2 ? rated.reduce((a, b) => ((b.share ?? 1) < (a.share ?? 1) ? b : a)) : null
  const tsItems = items.filter((p) => !timesaveKeys || timesaveKeys.includes(p.key))
  const maxGap = Math.max(1000, ...tsItems.map((p) => Math.abs(timesaves.median[p.key] ?? 0)))

  return (
    <section className="surface p-5">
      <header className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        <div className="flex overflow-hidden rounded-lg border border-[var(--line)] text-[11px]">
          {(['performance', 'timesaves'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-2.5 py-1 font-medium capitalize transition-colors"
              style={{
                color: tab === t ? 'var(--gold)' : 'var(--muted)',
                background: tab === t ? 'rgba(245,200,66,0.12)' : 'transparent'
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </header>
      <p className="text-xs text-faint">{description}</p>

      {data.length < 3 ? (
        <div className="grid h-[220px] place-items-center text-center text-sm text-muted">
          {loading ? 'Loading match data…' : 'Not enough data yet.'}
        </div>
      ) : tab === 'performance' ? (
        <>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="60%" margin={{ top: 24, right: 62, bottom: 24, left: 62 }}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="axis" tick={<Tick items={byLabel} />} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke="#86b8db" fill="#3f82ff" fillOpacity={0.3} isAnimationActive animationDuration={600} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {strongest && weakest && (
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Extreme title="Strongest" p={strongest} colour="#5fd38d" />
              <Extreme title="Weakest" p={weakest} colour="#e2706e" />
            </div>
          )}
          <table className="mt-3 w-full table-fixed text-center text-xs">
            <thead>
              <tr className="text-[10px] text-faint">
                <th className="w-[84px]" />
                {items.map((p) => (
                  <th key={p.key} className="pb-1 font-medium">
                    {p.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label={countsLabel} items={items} cell={(p) => String(p.count)} />
              {deaths && (
                <Row label="Deaths" items={items} cell={(p) => `${deaths[p.key].count} · ${rate(deaths[p.key].rate)}`} />
              )}
              {oppDeaths && (
                <Row label="Opp. deaths" items={items} cell={(p) => `${oppDeaths[p.key].count} · ${rate(oppDeaths[p.key].rate)}`} />
              )}
            </tbody>
          </table>
        </>
      ) : (
        <div className="mt-3 space-y-1.5">
          {tsItems.map((p) => {
            const gap = timesaves.median[p.key]
            const w = timesaves.wins[p.key] ?? 0
            const l = timesaves.losses[p.key] ?? 0
            const width = gap == null ? 0 : (Math.abs(gap) / maxGap) * 50
            return (
              <div key={p.key} className="grid grid-cols-[96px_1fr_118px] items-center gap-3 text-xs">
                <span className="truncate text-muted">{p.label}</span>
                <div className="relative h-4 rounded bg-white/[0.03]">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
                  {gap != null && gap !== 0 && (
                    <div
                      className="absolute inset-y-0.5 rounded-sm"
                      style={{
                        width: `${width}%`,
                        [gap < 0 ? 'right' : 'left']: '50%',
                        background: gap < 0 ? '#5fd38d' : '#e2706e',
                        opacity: 0.8
                      }}
                    />
                  )}
                </div>
                <span className="tnum text-right" style={{ color: gap == null ? 'var(--faint)' : gap <= 0 ? '#5fd38d' : '#e2706e' }}>
                  {gap == null ? 'No data' : gapText(gap)}
                  {w + l > 0 && (
                    <span className="ml-1.5 text-faint">
                      {Math.round((w / (w + l)) * 100)}% won
                    </span>
                  )}
                </span>
              </div>
            )
          })}
          <p className="pt-1 text-[11px] text-faint">
            Median gap to your opponent on the first pass, in games where you both got there, and how often
            you got there first.
          </p>
        </div>
      )}
    </section>
  )
}

function Extreme({ title, p, colour }: { title: string; p: PerfItem; colour: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] px-3 py-2">
      <div className="text-[10px] text-faint">
        {title} · {p.label}
      </div>
      <div className="tnum font-display text-sm" style={{ color: colour }}>
        {p.ms != null ? msToTime(p.ms) : '—'}
        {p.share != null && <span className="ml-1.5 text-xs text-muted">({topLabel(p.share)})</span>}
      </div>
    </div>
  )
}

function Row({ label, items, cell }: { label: string; items: PerfItem[]; cell: (p: PerfItem) => string }) {
  return (
    <tr className="odd:bg-white/[0.02]">
      <td className="py-1 pl-1 text-left text-muted">{label}</td>
      {items.map((p) => (
        <td key={p.key} className="tnum py-1 text-text">
          {cell(p)}
        </td>
      ))}
    </tr>
  )
}
