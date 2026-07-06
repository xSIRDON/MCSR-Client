export type TierName = 'Unrated' | 'Coal' | 'Iron' | 'Gold' | 'Emerald' | 'Diamond' | 'Netherite'

export interface Rank {
  name: string
  tier: TierName
  division: number
  min: number
  max: number
  color: string
  glow: string
}

interface TierDef {
  tier: TierName
  color: string
  glow: string
  divisions: number[]
  base: number
}

const TIERS: TierDef[] = [
  { tier: 'Coal', color: '#aaaaaa', glow: '#cccccc', base: 0, divisions: [199, 399, 599] },
  { tier: 'Iron', color: '#d4d4d4', glow: '#f0f0f0', base: 600, divisions: [699, 799, 899] },
  { tier: 'Gold', color: '#f5c842', glow: '#ffd966', base: 900, divisions: [999, 1099, 1199] },
  { tier: 'Emerald', color: '#4aff8c', glow: '#7fffb0', base: 1200, divisions: [1299, 1399, 1499] },
  { tier: 'Diamond', color: '#4af0d8', glow: '#7fffd4', base: 1500, divisions: [1666, 1833, 1999] },
  { tier: 'Netherite', color: '#c0a0ff', glow: '#dfc0ff', base: 2000, divisions: [] }
]

const ROMAN = ['', 'I', 'II', 'III']

function buildRanks(): Rank[] {
  const ranks: Rank[] = []
  for (const t of TIERS) {
    if (t.divisions.length === 0) {
      ranks.push({
        name: t.tier,
        tier: t.tier,
        division: 0,
        min: t.base,
        max: Infinity,
        color: t.color,
        glow: t.glow
      })
      continue
    }
    let lo = t.base
    t.divisions.forEach((hi, i) => {
      ranks.push({
        name: `${t.tier} ${ROMAN[i + 1]}`,
        tier: t.tier,
        division: i + 1,
        min: lo,
        max: hi,
        color: t.color,
        glow: t.glow
      })
      lo = hi + 1
    })
  }
  return ranks
}

export const RANKS: Rank[] = buildRanks()

export const UNRATED: Rank = {
  name: 'Unrated',
  tier: 'Unrated',
  division: 0,
  min: 0,
  max: 0,
  color: '#7c7c88',
  glow: '#7c7c88'
}

export function eloToRank(elo: number | null | undefined): Rank {
  if (elo == null || Number.isNaN(elo)) return UNRATED
  const found = RANKS.find((r) => elo >= r.min && elo <= r.max)
  return found ?? RANKS[RANKS.length - 1]
}

export function eloWinChance(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400))
}
