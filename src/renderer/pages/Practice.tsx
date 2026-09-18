// "Practice" — seeds from GapCheck (gapcheck.gg): draw a curated top-runner match, copy its four
// seeds into a ranked private room, play it, then compare split by split and jump to their POV at
// any split. The video-vs-video comparison is GapCheck's own feature, so each card links there.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { msToTime, epochToAgo } from '@core/format'
import { analyzeSplits, buildSplitGap, seedStructureLabel, splitsFromTimeline } from '@core/ranked-analytics'
import { usePlayerAnalytics } from '../hooks/usePlayerAnalytics'
import { usePractice, DEFAULT_PRACTICE_FILTERS } from '../hooks/usePractice'
import type { PracticeFilters } from '../hooks/usePractice'
import type { GapCheckSeed } from '@shared/types'
import type { MatchInfo } from '@services/mcsr-ranked'
import { PlayerAutocomplete } from '../components/PlayerAutocomplete'
import { PlayerHead } from '../components/PlayerHead'

const SEED_TYPES = ['RUINED_PORTAL', 'DESERT_TEMPLE', 'VILLAGE', 'SHIPWRECK', 'BURIED_TREASURE'] as const
const BASTION_TYPES = ['BRIDGE', 'STABLES', 'HOUSING', 'TREASURE'] as const

/** Compact signed gap: "+15s", "-8s", "+1:23". */
function fmtGap(ms: number): string {
  const sec = Math.round(ms / 1000)
  const sign = sec < 0 ? '−' : '+'
  const a = Math.abs(sec)
  return a >= 60 ? `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}` : `${sign}${a}s`
}

/** Twitch wants ?t=1h02m03s. */
function twitchAt(url: string, seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${url}?t=${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`
}

export function Practice() {
  const profile = useUi((s) => s.profile)
  const [filters, setFilters] = useState<PracticeFilters>(DEFAULT_PRACTICE_FILTERS)
  const [runnerName, setRunnerName] = useState('')

  // A runner filter needs their uuid; GapCheck matches players by uuid, not name.
  const {
    data: runner,
    isPending: runnerPending,
    isError: runnerMissing
  } = useQuery({
    queryKey: ['user', runnerName],
    queryFn: () => mcsr.getUser(runnerName),
    enabled: runnerName.trim().length > 1,
    retry: false
  })
  const typingRunner = runnerName.trim().length > 1
  const runnerUuid = typingRunner ? (runner?.uuid ?? null) : null
  const effective = useMemo<PracticeFilters>(() => ({ ...filters, runnerUuid }), [filters, runnerUuid])

  const { counts, seeds, draw, drawing, error, clear } = usePractice(effective)
  const mine = usePlayerAnalytics(profile?.uuid)

  const set = <K extends keyof PracticeFilters>(key: K, value: PracticeFilters[K]): void =>
    setFilters((f) => ({ ...f, [key]: value }))

  return (
    <div className="mx-auto max-w-[980px] space-y-4 px-5 py-4">
      <header className="animate-fade-up">
        <div className="text-[11px] uppercase tracking-[0.22em] text-faint">Practice</div>
        <h1 className="font-display text-2xl tracking-wide text-text">Play the same seeds as the best</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Draw a top-runner match, paste its seeds into a ranked private room, and play it out — then
          see where your pace breaks, split by split, and jump straight to their POV.
        </p>
        <p className="mt-1.5 text-xs text-faint">
          Seeds, VODs and timelines from{' '}
          <a
            href="https://gapcheck.gg"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--gold)] underline"
          >
            GapCheck
          </a>{' '}
          — built by cylorun, Luxvored and marmarounos.{' '}
          <a
            href="https://ko-fi.com/gapcheck"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-muted"
          >
            Support them
          </a>
          .
        </p>
      </header>

      {/* Filters */}
      <section className="surface p-4 animate-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted">Overworld</div>
        <div className="flex flex-wrap gap-1.5">
          <Pill on={filters.seedType === null} onClick={() => set('seedType', null)}>
            Any {counts?.total ? <Count n={counts.total} /> : null}
          </Pill>
          {SEED_TYPES.map((t) => (
            <Pill key={t} on={filters.seedType === t} onClick={() => set('seedType', t)}>
              {seedStructureLabel(t)} {counts?.byType?.[t] ? <Count n={counts.byType[t]} /> : null}
            </Pill>
          ))}
        </div>

        <div className="mb-2 mt-4 text-[11px] uppercase tracking-[0.16em] text-muted">Bastion</div>
        <div className="flex flex-wrap gap-1.5">
          <Pill on={filters.bastionType === null} onClick={() => set('bastionType', null)}>
            Any
          </Pill>
          {BASTION_TYPES.map((t) => (
            <Pill key={t} on={filters.bastionType === t} onClick={() => set('bastionType', t)}>
              {seedStructureLabel(t)}
            </Pill>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Num label="Under (min)" value={filters.maxMinutes} onChange={(v) => set('maxMinutes', v)} />
          <Num label="Over (min)" value={filters.minMinutes} onChange={(v) => set('minMinutes', v)} />
          <Num label="Top rank #" value={filters.minRank} onChange={(v) => set('minRank', v)} step={50} />
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-muted">
              Top runner
            </span>
            <PlayerAutocomplete
              value={runnerName}
              onChange={setRunnerName}
              onSubmit={(name) => setRunnerName(name.trim())}
              placeholder="Anyone in their collection"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 text-xs text-text outline-none transition-colors placeholder:text-faint focus:border-[var(--gold)]/40"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            {seeds.length > 0 && (
              <button
                onClick={clear}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-text"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => void draw()}
              disabled={drawing}
              className="rounded-lg border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-4 py-1.5 text-sm font-medium text-[var(--gold)] transition-all hover:bg-[var(--gold)]/20 disabled:opacity-50"
            >
              {drawing ? 'Drawing…' : seeds.length > 0 ? 'Draw another' : 'Get a seed'}
            </button>
          </div>
        </div>
        {typingRunner && runnerPending && (
          <div className="mt-2 text-xs text-faint">Looking up “{runnerName}”…</div>
        )}
        {typingRunner && runnerMissing && (
          <div className="mt-2 text-xs text-[var(--loss)]">
            No player called “{runnerName}” on MCSR Ranked — check the spelling.
          </div>
        )}
        {/* GapCheck's collection is top-runner matches only, so most players have nothing in it. */}
        {runnerUuid && counts?.total === 0 && (
          <div className="mt-2 text-xs text-[var(--loss)]">
            GapCheck has no seeds for {runner?.nickname ?? runnerName} — their collection only covers
            matches from top-ranked players. Clear the name to draw from the whole collection.
          </div>
        )}
        {!runnerUuid && counts?.total === 0 && (
          <div className="mt-2 text-xs text-[var(--loss)]">
            No seeds match these filters — try a longer time limit or a higher rank number.
          </div>
        )}
        {error && <div className="mt-2 text-xs text-[var(--loss)]">{error}</div>}
      </section>

      {/* Seeds */}
      {seeds.length === 0 ? (
        <div className="surface grid h-40 place-items-center px-6 text-center text-sm text-muted">
          {drawing ? 'Finding a seed…' : 'Pick your filters and draw a seed to practice.'}
        </div>
      ) : (
        <div className="space-y-4">
          {seeds.map((seed, i) => (
            <SeedCard
              key={seed.matchId}
              seed={seed}
              myUuid={profile?.uuid ?? null}
              myDetails={mine.details}
              delay={i === 0 ? 0 : 40}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SeedCard({
  seed,
  myUuid,
  myDetails,
  delay
}: {
  seed: GapCheckSeed
  myUuid: string | null
  myDetails: MatchInfo[]
  delay: number
}) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const runner = seed.players[0]
  const opponent = seed.players[1]

  // Their splits on this seed, through the same analysis as your own history.
  const runnerSplits = useMemo(
    () => (runner ? splitsFromTimeline(runner.uuid, runner.splits, runner.timeMs) : []),
    [runner]
  )

  // Your average on THIS kind of seed, so the gap is apples-to-apples; fall back to overall.
  const { mySplits, typed } = useMemo(() => {
    if (!myUuid) return { mySplits: [], typed: 0 }
    const sameType = myDetails.filter((m) => (m.seedType ?? m.seed?.overworld) === seed.seedType)
    return sameType.length >= 3
      ? { mySplits: analyzeSplits(myUuid, sameType), typed: sameType.length }
      : { mySplits: analyzeSplits(myUuid, myDetails), typed: 0 }
  }, [myUuid, myDetails, seed.seedType])

  const gap = useMemo(() => buildSplitGap(runnerSplits, mySplits), [runnerSplits, mySplits])
  const finishRow = gap.find((r) => r.key === 'finish')

  async function copy(label: string, value: string | null): Promise<void> {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      /* clipboard blocked — the value is on screen anyway */
    }
  }

  const allSeeds = [
    ['Overworld', seed.seeds.overworld],
    ['Nether', seed.seeds.nether],
    ['End', seed.seeds.end],
    ['RNG', seed.seeds.rng]
  ] as const

  return (
    <section className="surface p-4 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {runner && <PlayerHead id={runner.uuid} uuid={runner.uuid} size={34} className="rounded-lg" />}
          <div className="leading-tight">
            <div className="text-sm font-medium text-text">
              {runner?.nickname ?? 'Runner'}
              {opponent && <span className="text-faint"> vs {opponent.nickname}</span>}
            </div>
            <div className="text-[11px] text-faint">
              {runner?.eloRank ? `#${runner.eloRank}` : ''}
              {runner?.elo ? ` · ${runner.elo} elo` : ''}
              {seed.date ? ` · ${epochToAgo(seed.date)}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-display text-2xl tnum text-[var(--gold)]">
              {msToTime(seed.finalTimeMs)}
            </div>
            <div className="text-[10px] text-faint">their time</div>
          </div>
          {finishRow?.delta != null && (
            <div
              className="rounded-lg px-2 py-1 text-right text-xs"
              style={{
                background: finishRow.delta > 0 ? 'rgba(255,90,90,0.12)' : 'rgba(74,255,140,0.12)',
                color: finishRow.delta > 0 ? 'var(--loss)' : 'var(--win)'
              }}
            >
              <div className="font-display tnum text-sm">{fmtGap(finishRow.delta)}</div>
              <div className="text-[10px] opacity-80">{finishRow.delta > 0 ? 'behind' : 'ahead'}</div>
            </div>
          )}
        </div>
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{seedStructureLabel(seed.seedType)}</Chip>
        <Chip>{seedStructureLabel(seed.bastionType)} bastion</Chip>
        {seed.rngConfidence && (
          <Chip>
            RNG {seed.rngConfidence.matches}/{seed.rngConfidence.total}
          </Chip>
        )}
      </div>

      {/* The seeds themselves — the whole point: these paste into a private room. */}
      <div className="mt-3 space-y-1">
        {allSeeds.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-[74px] shrink-0 text-[11px] uppercase tracking-wider text-faint">
              {label}
            </span>
            <code className="min-w-0 flex-1 truncate rounded-md bg-black/25 px-2 py-1 text-[11px] text-text">
              {value ?? '—'}
            </code>
            <button
              onClick={() => void copy(label, value)}
              disabled={!value}
              className="shrink-0 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-muted transition-colors hover:text-text disabled:opacity-40"
            >
              {copied === label ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            void copy(
              'all',
              allSeeds
                .filter(([, v]) => v)
                .map(([l, v]) => `${l}: ${v}`)
                .join('\n')
            )
          }
          className="rounded-lg border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-3 py-1.5 text-xs font-medium text-[var(--gold)] transition-all hover:bg-[var(--gold)]/20"
        >
          {copied === 'all' ? 'Copied all ✓' : 'Copy all four'}
        </button>
        {seed.players.map(
          (p) =>
            p.vod && (
              <a
                key={p.uuid}
                href={twitchAt(p.vod.url, p.vod.runStartSeconds)}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
              >
                {p.nickname}’s POV
              </a>
            )
        )}
        <a
          href={seed.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
        >
          Compare on GapCheck ↗
        </a>
        <button
          onClick={() => setRevealed((r) => !r)}
          className="ml-auto rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
        >
          {revealed ? 'Hide their run' : 'Reveal their run'}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-faint">
        Ranked private room → Set Seed, paste these, and record. Their splits stay hidden until you
        want them.
      </p>

      {revealed && (
        <div className="mt-3 border-t border-[var(--line)] pt-2">
          {seed.endTowers.length > 0 && (
            <div className="mb-2 text-[11px] text-faint">End towers: {seed.endTowers.join(' / ')}</div>
          )}
          <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 text-[10px] uppercase tracking-wider text-faint">
            <span>Split</span>
            <span className="text-right">Them</span>
            <span className="text-right">You (typical)</span>
            <span className="text-right">Gap</span>
            <span />
          </div>
          <ul className="space-y-0.5">
            {gap
              .filter((r) => r.runnerMs != null)
              .map((r) => (
                <li
                  key={r.key}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 text-xs"
                >
                  <span className="truncate text-muted">{r.label}</span>
                  <span className="tnum text-right text-text">{msToTime(r.runnerMs)}</span>
                  <span className="tnum text-right text-faint">{msToTime(r.youMs)}</span>
                  <span
                    className="tnum text-right"
                    style={{
                      color: r.delta == null ? 'var(--faint)' : r.delta > 0 ? 'var(--loss)' : 'var(--win)'
                    }}
                  >
                    {r.delta == null ? '—' : fmtGap(r.delta)}
                  </span>
                  {/* Fort → Finish is a duration, not a point in the run, so it gets no POV link. */}
                  {runner?.vod && r.runnerMs != null && r.key !== 'fortToFinish' ? (
                    <a
                      href={twitchAt(runner.vod.url, runner.vod.runStartSeconds + r.runnerMs / 1000)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-faint underline hover:text-muted"
                      title={`Watch ${runner.nickname} at ${r.label}`}
                    >
                      POV
                    </a>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-faint">
            {!myUuid
              ? 'Sign in to compare against your own splits.'
              : typed
                ? `Your median over ${typed} ${seedStructureLabel(seed.seedType)} run${typed === 1 ? '' : 's'} — a bad run doesn’t skew it`
                : 'Your overall median — not enough of this seed type yet'}
          </p>
        </div>
      )}
    </section>
  )
}

function Count({ n }: { n: number }) {
  return <span className="text-[10px] tnum text-faint">{n.toLocaleString()}</span>
}

function Pill({
  on,
  onClick,
  children
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors ${
        on
          ? 'border-[var(--gold)]/50 bg-[var(--gold)]/12 text-[var(--gold)]'
          : 'border-[var(--line)] text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

function Num({
  label,
  value,
  onChange,
  step = 1
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  step?: number
}) {
  return (
    <label className="w-[104px]">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-muted">{label}</span>
      <input
        type="number"
        min={1}
        step={step}
        value={value ?? ''}
        placeholder="—"
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(e.target.value === '' || !Number.isFinite(n) || n <= 0 ? null : n)
        }}
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 text-xs text-text outline-none transition-colors placeholder:text-faint focus:border-[var(--gold)]/40"
      />
    </label>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--line)] bg-[var(--bg-2)] px-2 py-0.5 text-[11px] text-muted">
      {children}
    </span>
  )
}
