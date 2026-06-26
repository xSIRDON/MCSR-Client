import { useState } from 'react'

interface Props {
  /** username or dashless uuid */
  id: string
  /** dashed uuid for the crafatar fallback, if available */
  uuid?: string
  size?: number
  render?: 'avatar' | 'body'
  className?: string
}

/** Player head/body via mc-heads, falling back to crafatar, then a pixel block. */
export function PlayerHead({ id, uuid, size = 64, render = 'avatar', className }: Props) {
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  // Prefer the dashless uuid — both providers resolve it far more reliably than a
  // username, which is the usual reason only some heads load on a busy list.
  const dashless = (uuid ?? id).replace(/-/g, '')
  const dashed = uuid ?? id

  const src =
    stage === 0
      ? `https://mc-heads.net/${render === 'body' ? 'body' : 'avatar'}/${encodeURIComponent(dashless)}/${size}`
      : `https://crafatar.com/${render === 'body' ? 'renders/body' : 'avatars'}/${encodeURIComponent(
          dashed
        )}?size=${size}&overlay`

  if (stage === 2) {
    return (
      <div
        className={`pixelated grid place-items-center rounded-md ${className ?? ''}`}
        style={{ width: size, height: size, background: '#1a1a28', border: '1px solid var(--line)' }}
      >
        <span className="font-display text-muted" style={{ fontSize: size * 0.4 }}>
          {id.slice(0, 1).toUpperCase()}
        </span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={id}
      width={size}
      height={render === 'body' ? size * 2 : size}
      className={`pixelated ${className ?? ''}`}
      style={{ imageRendering: 'pixelated' }}
      onError={() => setStage((s) => (s + 1) as 0 | 1 | 2)}
      draggable={false}
    />
  )
}
