import type { ReactElement } from 'react'
import type { InstanceId } from '@shared/types'

// Pixel-art mode wordmarks in the style of the Ranked logo: a 2×3 badge (three 5×7
// glyphs per row) in green on a dark frame. RANKED / RANDOM (RSG) / FILTER (ZSG).

const G: Record<string, string[]> = {
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100']
}

const WORDS: Record<InstanceId, [string, string]> = {
  ranked: ['RAN', 'KED'],
  rsg: ['RAN', 'DOM'],
  zsg: ['FIL', 'TER']
}

// Each mode in its own accent: Ranked gold, RSG portal-purple, ZSG teal.
const COLOR: Record<InstanceId, string> = {
  ranked: '#f5c842',
  rsg: '#8b5cf6',
  zsg: '#4fd6b0'
}

function pixels(ch: string, ox: number, oy: number): ReactElement[] {
  const rows = G[ch]
  const out: ReactElement[] = []
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === '1') {
        out.push(<rect key={`${ox}-${oy}-${x}-${y}`} x={ox + x} y={oy + y} width={1} height={1} />)
      }
    }
  }
  return out
}

/** A small pixel-art wordmark badge for a mode. `size` is the rendered height in px. */
export function ModeBadge({
  mode,
  size = 28,
  className
}: {
  mode: InstanceId
  size?: number
  className?: string
}): ReactElement {
  const [top, bottom] = WORDS[mode]
  const pad = 2
  const W = 21
  const H = 20
  const cols = [pad, pad + 6, pad + 12]
  return (
    <svg
      width={(size * W) / H}
      height={size}
      viewBox={`0 0 ${W} ${H}`}
      className={`pixelated ${className ?? ''}`}
      role="img"
      aria-label={mode.toUpperCase()}
    >
      <rect x="0" y="0" width={W} height={H} rx="2.4" fill="#11151f" stroke="#ffffff14" strokeWidth="0.4" />
      <g fill={COLOR[mode]}>
        {top.split('').flatMap((ch, i) => pixels(ch, cols[i], pad))}
        {bottom.split('').flatMap((ch, i) => pixels(ch, cols[i], pad + 9))}
      </g>
    </svg>
  )
}
