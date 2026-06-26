import { useId } from 'react'
import type { ReactElement } from 'react'

// License-clean pixel-art "MCSR" wordmark — a 2×2 badge (MC / SR) drawn from a
// 5×7 bitmap font, filled with the app's gold→portal brand gradient.

const GLYPHS: Record<string, string[]> = {
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001']
}

function pixels(ch: string, ox: number, oy: number): ReactElement[] {
  const rows = GLYPHS[ch]
  const out: ReactElement[] = []
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === '1') {
        out.push(<rect key={`${ch}-${x}-${y}`} x={ox + x} y={oy + y} width={1} height={1} />)
      }
    }
  }
  return out
}

/** The app's pixel-art "MCSR" logo. `size` is the rendered height in px. */
export function McsrLogo({ size = 40, className }: { size?: number; className?: string }): ReactElement {
  const gid = 'mcsr-' + useId().replace(/:/g, '')
  const pad = 2
  const W = 15
  const H = 20
  return (
    <svg
      width={(size * W) / H}
      height={size}
      viewBox={`0 0 ${W} ${H}`}
      className={`pixelated ${className ?? ''}`}
      role="img"
      aria-label="MCSR"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--portal)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="2.6" fill="#0e0e18" stroke="var(--line-strong)" strokeWidth="0.4" />
      <g fill={`url(#${gid})`}>
        {pixels('M', pad, pad)}
        {pixels('C', pad + 6, pad)}
        {pixels('S', pad, pad + 9)}
        {pixels('R', pad + 6, pad + 9)}
      </g>
    </svg>
  )
}
