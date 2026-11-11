import type { InstanceId } from '@shared/types'
import ranked from '../assets/modes/ranked.svg'
import rsg from '../assets/modes/rsg.svg'
import zsg from '../assets/modes/zsg.svg'

const ART: Record<InstanceId, string> = { ranked, rsg, zsg }

export function ModeBadge({ mode, size = 34, className }: { mode: InstanceId; size?: number; className?: string }) {
  return (
    <img
      src={ART[mode]}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={`pixelated shrink-0 ${className ?? ''}`}
    />
  )
}
