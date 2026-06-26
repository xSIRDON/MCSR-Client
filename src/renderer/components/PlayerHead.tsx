import { useState } from 'react'

interface Props {
  id: string
  uuid?: string
  size?: number
  render?: 'avatar' | 'body'
  className?: string
}

const MAX_STAGE = 3

export function PlayerHead({ id, uuid, size = 64, render = 'avatar', className }: Props) {
  const playerKey = `${id}|${uuid ?? ''}`
  const [prevKey, setPrevKey] = useState(playerKey)
  const [stage, setStage] = useState(0)
  if (playerKey !== prevKey) {
    setPrevKey(playerKey)
    setStage(0)
  }

  const raw = (uuid ?? id).replace(/-/g, '')
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
