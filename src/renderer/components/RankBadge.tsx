import { eloToRank } from '@core/rank'
import { RankGem } from './BlockArt'

interface Props {
  elo: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
}

/** Tier badge derived from ELO — colored, glowing, with a pixel gem. */
export function RankBadge({ elo, size = 'md' }: Props) {
  const rank = eloToRank(elo)
  const pad = size === 'lg' ? 'px-3.5 py-2 text-base' : size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  const gem = size === 'lg' ? 26 : size === 'sm' ? 16 : 20
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg font-display ${pad}`}
      style={{
        color: rank.color,
        background: `linear-gradient(180deg, ${rank.color}1f, ${rank.color}0a)`,
        border: `1px solid ${rank.color}55`,
        boxShadow: `0 0 18px ${rank.glow}33, inset 0 0 12px ${rank.color}12`
      }}
      title={`${rank.name} · ${elo ?? 'unranked'} ELO`}
    >
      <RankGem color={rank.color} glow={rank.glow} size={gem} />
      <span className="tracking-wide">{rank.name}</span>
    </span>
  )
}
