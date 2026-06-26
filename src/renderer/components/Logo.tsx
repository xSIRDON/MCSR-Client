import type { ReactElement } from 'react'
import clockUrl from '../assets/clock.png'

/** The app's clock logo (the pixel-art Minecraft clock). `size` = rendered side in px. */
export function McsrLogo({ size = 40, className }: { size?: number; className?: string }): ReactElement {
  return (
    <img
      src={clockUrl}
      width={size}
      height={size}
      alt="MCSR Client"
      draggable={false}
      className={`pixelated ${className ?? ''}`}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
