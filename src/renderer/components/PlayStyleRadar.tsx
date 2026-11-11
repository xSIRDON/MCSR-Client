import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip
} from 'recharts'
import type { ScoreDim } from '@core/ranked-analytics'

function RadarTooltip({
  active,
  payload
}: {
  active?: boolean
  payload?: Array<{ payload: { axis: string; score: number; detail: string } }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="surface-2 px-3 py-2 text-xs">
      <div className="font-display text-text">
        {p.axis} · {p.score}
      </div>
      <div className="text-muted">{p.detail}</div>
    </div>
  )
}

export function PlayStyleRadar({ dims }: { dims: ScoreDim[] }) {
  const data = dims.map((d) => ({ axis: d.label, score: d.score, detail: d.detail }))
  return (
    <section className="surface p-5">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">
          Strengths &amp; weaknesses
        </h2>
        <span className="text-xs text-faint">0–100</span>
      </header>
      {data.length < 3 ? (
        <div className="grid h-[240px] place-items-center text-center text-sm text-muted">
          Play more ranked games to build your profile.
        </div>
      ) : (
        <div className="h-[270px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: '#8b8b9e', fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="score"
                stroke="#f5c842"
                fill="#f5c842"
                fillOpacity={0.28}
                isAnimationActive
                animationDuration={600}
              />
              <Tooltip content={<RadarTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.length >= 3 && (
        <ul className="mt-3 space-y-2">
          {data.map((d) => (
            <li key={d.axis} className="grid grid-cols-[110px_1fr_28px] items-center gap-3 text-xs" title={d.detail}>
              <span className="truncate text-muted">{d.axis}</span>
              <div className="h-1.5 bg-white/[0.05]">
                <div className="h-full bg-[var(--gold)]" style={{ width: `${Math.max(0, Math.min(100, d.score))}%` }} />
              </div>
              <span className="tnum text-right text-text">{Math.round(d.score)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
