import { SELECTIONS, type Selection } from '../hooks/usePlayerAnalytics'
import { TIER_ORDER, tierName, type CompareTo } from '../lib/baseline'

const SELECT =
  'cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-2 py-1 font-display text-sm normal-case tracking-normal text-text outline-none transition-colors hover:border-[var(--gold)]/40'

export function SelectionPicker({ value, onChange }: { value: Selection; onChange: (s: Selection) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-faint">
      Matches
      <select value={value} onChange={(e) => onChange(Number(e.target.value) as Selection)} className={SELECT}>
        {SELECTIONS.map((n) => (
          <option key={n} value={n}>
            Last {n}
          </option>
        ))}
      </select>
    </label>
  )
}

export function CompareToPicker({ value, onChange }: { value: CompareTo; onChange: (c: CompareTo) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-faint">
      Compare to
      <select value={value} onChange={(e) => onChange(e.target.value as CompareTo)} className={SELECT}>
        {(['world', ...TIER_ORDER] as CompareTo[]).map((c) => (
          <option key={c} value={c}>
            {tierName(c)}
          </option>
        ))}
      </select>
    </label>
  )
}
