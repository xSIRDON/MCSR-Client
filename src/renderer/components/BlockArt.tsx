// License-clean inline pixel-art SVGs (no Mojang textures). Crisp 16×16 grids.

interface BlockProps {
  size?: number
  className?: string
}

/** A faceted rank "gem" tinted to a tier color. Used in the rank badge. */
export function RankGem({ color, glow, size = 22 }: { color: string; glow: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="pixelated" aria-hidden>
      <g>
        <rect x="6" y="1" width="4" height="2" fill={color} />
        <rect x="4" y="3" width="8" height="2" fill={color} />
        <rect x="2" y="5" width="12" height="4" fill={color} />
        <rect x="3" y="9" width="10" height="2" fill={color} />
        <rect x="5" y="11" width="6" height="2" fill={color} />
        <rect x="7" y="13" width="2" height="2" fill={color} />
        {/* highlight */}
        <rect x="5" y="3" width="2" height="2" fill="#ffffff" opacity="0.85" />
        <rect x="3" y="5" width="2" height="2" fill="#ffffff" opacity="0.5" />
        {/* shadow */}
        <rect x="11" y="7" width="2" height="2" fill="#000000" opacity="0.28" />
        <rect x="9" y="11" width="2" height="2" fill="#000000" opacity="0.28" />
      </g>
      <filter id={`g-${color}`}>
        <feDropShadow dx="0" dy="0" stdDeviation="0.6" floodColor={glow} />
      </filter>
    </svg>
  )
}

/** A small netherite block motif. */
export function NetheriteBlock({ size = 18, className }: BlockProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={`pixelated ${className ?? ''}`} aria-hidden>
      <rect width="16" height="16" fill="#140f24" />
      <rect x="1" y="1" width="6" height="6" fill="#1d1533" />
      <rect x="9" y="2" width="5" height="5" fill="#241a3f" />
      <rect x="2" y="9" width="5" height="5" fill="#241a3f" />
      <rect x="9" y="9" width="6" height="6" fill="#1a1230" />
      <rect x="3" y="3" width="1" height="1" fill="#7c5cff" opacity="0.7" />
      <rect x="11" y="11" width="1" height="1" fill="#7c5cff" opacity="0.6" />
    </svg>
  )
}

/** A nether-portal swirl motif. */
export function PortalBlock({ size = 18, className }: BlockProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={`pixelated ${className ?? ''}`} aria-hidden>
      <rect width="16" height="16" fill="#2a1259" />
      <rect x="2" y="2" width="12" height="12" fill="#4c1d95" />
      <rect x="4" y="3" width="3" height="3" fill="#8b5cf6" opacity="0.85" />
      <rect x="9" y="6" width="3" height="3" fill="#a78bfa" opacity="0.8" />
      <rect x="5" y="9" width="3" height="3" fill="#7c3aed" opacity="0.9" />
      <rect x="3" y="11" width="2" height="2" fill="#c4b5fd" opacity="0.7" />
    </svg>
  )
}
