import { donorInfo, type DonorTier } from '@services/mcsr-ranked'
import stonePick from '../assets/donor/stone_pickaxe.png'
import ironPick from '../assets/donor/iron_pickaxe.png'
import diamondPick from '../assets/donor/diamond_pickaxe.png'

const PICKAXE: Record<DonorTier, string> = {
  stone: stonePick,
  iron: ironPick,
  diamond: diamondPick
}

export function DonorBadge({
  roleType,
  withLabel = false,
  size = 15
}: {
  roleType?: number | null
  withLabel?: boolean
  size?: number
}) {
  const d = donorInfo(roleType)
  if (!d) return null
  return (
    <span title={`${d.label} supporter`} className="inline-flex shrink-0 items-center gap-1">
      <img
        src={PICKAXE[d.tier]}
        alt={`${d.label} supporter`}
        width={size}
        height={size}
        className="shrink-0"
        style={{ imageRendering: 'pixelated' }}
      />
      {withLabel && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: d.color }}
        >
          {d.label}
        </span>
      )}
    </span>
  )
}
