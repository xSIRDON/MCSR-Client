interface BlockProps {
  size?: number
  className?: string
}

export function RankGem({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="pixelated" aria-hidden>
      <rect x="6" y="1" width="4" height="2" fill={color} />
      <rect x="4" y="3" width="8" height="2" fill={color} />
      <rect x="2" y="5" width="12" height="4" fill={color} />
      <rect x="3" y="9" width="10" height="2" fill={color} />
      <rect x="5" y="11" width="6" height="2" fill={color} />
      <rect x="7" y="13" width="2" height="2" fill={color} />
      <rect x="5" y="3" width="2" height="2" fill="#ffffff" opacity="0.85" />
      <rect x="3" y="5" width="2" height="2" fill="#ffffff" opacity="0.5" />
      <rect x="11" y="7" width="2" height="2" fill="#000000" opacity="0.28" />
      <rect x="9" y="11" width="2" height="2" fill="#000000" opacity="0.28" />
    </svg>
  )
}

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
