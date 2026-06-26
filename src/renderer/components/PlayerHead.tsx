import { useState } from 'react'

interface Props {
  /** username or dashless uuid */
  id: string
  /** dashed-or-dashless uuid for the fallback provider, if available */
  uuid?: string
  size?: number
  render?: 'avatar' | 'body'
  className?: string
}

// mc-heads → mc-heads (cache-busted retry) → crafatar → letter block.
// Stage 1 exists because mc-heads renders bodies on demand: the first hit for a
// fresh uuid can 404/5xx while it generates, so a single retry (with a differing
// query) usually succeeds rather than cascading straight to the dead-ended block.
const MAX_STAGE = 3

/**
 * Player head/body with a resilient source cascade. The stage resets synchronously
 * when the player changes (adjust-state-during-render), and the <img> is keyed by
 * player+stage so an aborted load from a previous player can never advance the next
 * player's stage.
 */
export function PlayerHead({ id, uuid, size = 64, render = 'avatar', className }: Props) {
  const playerKey = `${id}|${uuid ?? ''}`
  const [prevKey, setPrevKey] = useState(playerKey)
  const [stage, setStage] = useState(0)
  if (playerKey !== prevKey) {
    setPrevKey(playerKey)
    setStage(0)
  }

  const raw = (uuid ?? id).replace(/-/g, '')
  // crafatar resolves a *dashed* uuid; build one when we actually have a 32-char hex.
  const dashed = /^[0-9a-fA-F]{32}$/.test(raw)
    ? raw.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
    : uuid ?? id
  const isBody = render === 'body'

  if (stage >= MAX_STAGE) {
    return (
      <div
        className={`pixelated grid place-items-center rounded-md ${className ?? ''}`}
        style={{
          width: size,
          height: isBody ? size * 2 : size,
          background: '#1a1a28',
          border: '1px solid var(--line)'
        }}
      >
        <span className="font-display text-muted" style={{ fontSize: size * 0.4 }}>
          {id.slice(0, 1).toUpperCase()}
        </span>
      </div>
    )
  }

  const mcHeads = `https://mc-heads.net/${isBody ? 'body' : 'avatar'}/${encodeURIComponent(raw)}/${size}`
  const src =
    stage === 0
      ? mcHeads
      : stage === 1
        ? `${mcHeads}?r=1`
        : `https://crafatar.com/${isBody ? 'renders/body' : 'avatars'}/${encodeURIComponent(dashed)}?size=${size}&overlay`

  return (
    <img
      key={`${playerKey}-${stage}`}
      src={src}
      alt={id}
      width={size}
      height={isBody ? size * 2 : size}
      className={`pixelated ${className ?? ''}`}
      style={{ imageRendering: 'pixelated' }}
      onError={() => setStage((s) => (s < MAX_STAGE ? s + 1 : s))}
      draggable={false}
    />
  )
}
