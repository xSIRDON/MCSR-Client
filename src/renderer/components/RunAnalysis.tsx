import {
  BASTION_LABEL,
  BASTION_TYPES,
  OW_LABEL,
  OW_TYPES,
  RUN_SPLIT_LABEL,
  RUN_SPLITS,
  topLabel,
  type BastionAnalysis,
  type ClutchStats,
  type OverworldAnalysis,
  type SplitAnalysis
} from '@core/run-analysis'
import { msToTime } from '@core/format'
import { eloEquivalent, POOL_PLAYERS, POOL_SEASON, shareBeaten, tierName, type CompareTo } from '../lib/baseline'
import { RunPerformanceCard, type PerfItem } from './RunPerformanceCard'

const SPLIT_SHORT: Record<string, string> = {
  ow: 'OW',
  nether: 'Neth',
  bastion: 'Bast',
  fortress: 'Fort',
  blind: 'Blind',
  stronghold: 'SH',
  end: 'End'
}
const OW_SHORT: Record<string, string> = { bt: 'BT', dt: 'DT', rp: 'RP', ship: 'Ship', village: 'Vil' }
const BASTION_SHORT: Record<string, string> = { bridge: 'Bridge', housing: 'Housing', stables: 'Stables', treasure: 'Treasure' }

function sampleNote(n: number, low: number, ok: number, what: string): string {
  if (n < low) return `A very low sample size, ${what} won't be reliable.`
  if (n < ok) return 'An OK sample size.'
  return 'A large sample size, so these reflect skill level properly.'
}

const against = (c: CompareTo): string => (c === 'world' ? 'the whole season playerbase' : `${tierName(c)} players`)

export function SplitRunsCard({ a, compareTo, loading }: { a: SplitAnalysis; compareTo: CompareTo; loading: boolean }) {
  const items: PerfItem[] = RUN_SPLITS.map((k) => ({
    key: k,
    label: RUN_SPLIT_LABEL[k],
    short: SPLIT_SHORT[k],
    ms: a.self.avg[k],
    count: a.self.count[k],
    share: shareBeaten(a.self.avg[k], 'split', k === 'ow' ? 'overworld' : k, true, compareTo)
  }))
  const d = (t: SplitAnalysis['deaths']['self']) =>
    Object.fromEntries(RUN_SPLITS.map((k) => [k, { count: t.count[k], rate: t.rate[k] }]))
  return (
    <RunPerformanceCard
      title="Split performance"
      description={`${a.games} games (${a.self.count.end} completions), ranked against ${against(compareTo)}. ${sampleNote(a.self.count.end, 8, 20, 'late-game averages')}`}
      items={items}
      countsLabel="Passes"
      deaths={d(a.deaths.self)}
      oppDeaths={d(a.deaths.opp)}
      timesaves={a.timesaves}
      timesaveKeys={RUN_SPLITS.filter((k) => k !== 'end')}
      loading={loading}
    />
  )
}

export function OverworldRunsCard({ a, compareTo, loading }: { a: OverworldAnalysis; compareTo: CompareTo; loading: boolean }) {
  const items: PerfItem[] = OW_TYPES.map((k) => ({
    key: k,
    label: OW_LABEL[k],
    short: OW_SHORT[k],
    ms: a.self.avg[k],
    count: a.self.count[k],
    share: shareBeaten(a.self.avg[k], 'ow', k, true, compareTo)
  }))
  return (
    <RunPerformanceCard
      title="Overworld performance"
      description={`${a.games} games, by structure type. ${sampleNote(a.games, 20, 50, 'per-type averages')}`}
      items={items}
      countsLabel="Overworlds"
      timesaves={a.timesaves}
      loading={loading}
    />
  )
}

export function BastionRunsCard({ a, compareTo, loading }: { a: BastionAnalysis; compareTo: CompareTo; loading: boolean }) {
  const items: PerfItem[] = BASTION_TYPES.map((k) => ({
    key: k,
    label: BASTION_LABEL[k],
    short: BASTION_SHORT[k],
    ms: a.self.avg[k],
    count: a.self.count[k],
    share: shareBeaten(a.self.avg[k], 'bastion', k, true, compareTo)
  }))
  const d = (t: BastionAnalysis['deaths']['self']) =>
    Object.fromEntries(BASTION_TYPES.map((k) => [k, { count: t.count[k], rate: t.rate[k] }]))
  return (
    <RunPerformanceCard
      title="Bastion performance"
      description={`${a.completed} completed bastions. ${sampleNote(a.completed, 12, 40, 'per-type averages')}`}
      items={items}
      countsLabel="Bastions"
      deaths={d(a.deaths.self)}
      oppDeaths={d(a.deaths.opp)}
      timesaves={a.timesaves}
      loading={loading}
    />
  )
}

interface StandingInput {
  bestTime: number | null
  averageTime: number | null
  elo: number | null
  forfeits: number
  losses: number
  completions: number
  played: number
  clutch: ClutchStats
  clutchReady: boolean
}

const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`

export function SeasonStandingCard({ s, compareTo }: { s: StandingInput; compareTo: CompareTo }) {
  const ffl = s.losses > 0 ? s.forfeits / s.losses : 0
  const comp = s.played > 0 ? s.completions / s.played : 0
  const sbElo = eloEquivalent('sb', s.bestTime)
  const avgElo = eloEquivalent('avg', s.averageTime)
  const tiles: { label: string; value: string; share: number | null; hint: string; extra?: string }[] = [
    { label: 'Season Best', value: msToTime(s.bestTime), share: shareBeaten(s.bestTime, 'stats', 'sb', true, compareTo), hint: 'Your fastest completion this season.', extra: sbElo != null ? `≈ ${sbElo} Elo` : undefined },
    { label: 'Avg Finish', value: msToTime(s.averageTime), share: shareBeaten(s.averageTime, 'stats', 'avg', true, compareTo), hint: 'Mean of every completion this season, no outliers removed.', extra: avgElo != null ? `≈ ${avgElo} Elo` : undefined },
    { label: 'Elo', value: s.elo != null ? String(s.elo) : '—', share: shareBeaten(s.elo, 'stats', 'elo', false, compareTo), hint: 'Current season rating.' },
    { label: 'Forfeit / Loss', value: pct1(ffl), share: s.losses > 0 ? shareBeaten(ffl, 'stats', 'ffl', true, compareTo) : null, hint: 'Forfeits as a share of losses: how often you give up rather than play it out.' },
    { label: 'Completion Rate', value: pct1(comp), share: s.completions > 0 ? shareBeaten(comp, 'stats', 'comprate', false, compareTo) : null, hint: 'Games finished, out of games played.' },
    { label: 'Choke Rate', value: s.clutchReady ? pct1(s.clutch.chokeRate) : '…', share: s.clutchReady ? shareBeaten(s.clutch.chokeRate, 'stats', 'chokerate', true, compareTo) : null, hint: 'Games where you died or reset, out of games played.' },
    { label: 'Resilience', value: s.clutchReady ? pct1(s.clutch.resilience) : '…', share: s.clutchReady && s.clutch.chokeRate > 0 ? shareBeaten(s.clutch.resilience, 'stats', 'resilience', false, compareTo) : null, hint: 'Your win rate in games where you died or reset.' },
    { label: 'Momentum', value: s.clutchReady ? s.clutch.momentum.toFixed(3) : '…', share: s.clutchReady ? shareBeaten(s.clutch.momentum, 'stats', 'momentum', false, compareTo) : null, hint: 'How streaky your results are: 1 is pure streaks, 0 is random, −1 always alternates.' }
  ]
  return (
    <section className="surface p-5">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Season standing</h2>
        <span className="text-[11px] text-faint">
          vs {compareTo === 'world' ? (POOL_PLAYERS ? `${POOL_PLAYERS.toLocaleString()} ` : '') : `${tierName(compareTo)} `}
          {POOL_SEASON ? `S${POOL_SEASON} ` : ''}players
        </span>
      </header>
      <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 border-l border-[var(--line)] pl-3 sm:[&:nth-child(4n+1)]:border-l-0 sm:[&:nth-child(4n+1)]:pl-0" title={t.hint}>
            <div className="text-[10px] text-faint">{t.label}</div>
            <div className="tnum mt-0.5 text-base text-text">{t.value}</div>
            <div className="truncate text-[11px]" style={{ color: t.share == null ? 'var(--faint)' : t.share >= 0.5 ? '#5fd38d' : '#e2706e' }}>
              {t.share == null ? '—' : topLabel(t.share)}
              {t.extra && <span className="ml-1.5 text-faint">{t.extra}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
