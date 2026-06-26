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

type Source = { url: string; tall: boolean }

/**
 * Player head/body across multiple independent hosts. mc-heads is preferred, with
 * minotar as a fully separate backup (different infra) so one host being blocked or
 * down — a VPN/network filter, a 5xx, crafatar's outage — can't take skins out. Body
 * renders fall back to the always-reliable face before the letter block. The cascade
 * resets synchronously when the player changes, and the <img> is keyed by player+stage
 * so a stale load from the previous player can't advance the next player's stage.
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
  // crafatar wants a dashed uuid; build one when we actually have a 32-char hex.
  const dashed = /^[0-9a-fA-F]{32}$/.test(raw)
    ? raw.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
    : uuid ?? id
  const isBody = render === 'body'

  const sources: Source[] = isBody
    ? [
        { url: `https://mc-heads.net/body/${raw}/${size}`, tall: true },
        { url: `https://minotar.net/armor/body/${raw}/${size}`, tall: true },
        { url: `https://mc-heads.net/avatar/${raw}/${size}`, tall: false },
        { url: `https://minotar.net/avatar/${raw}/${size}`, tall: false }
      ]
    : [
        { url: `https://mc-heads.net/avatar/${raw}/${size}`, tall: false },
        { url: `https://minotar.net/avatar/${raw}/${size}`, tall: false },
        { url: `https://crafatar.com/avatars/${dashed}?size=${size}&overlay`, tall: false }
      ]

  const cur = sources[stage]

  if (!cur) {
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

  return (
    <img
      key={`${playerKey}-${stage}`}
      src={cur.url}
      alt={id}
      width={size}
      height={cur.tall ? size * 2 : size}
      className={`pixelated ${className ?? ''}`}
      style={{ imageRendering: 'pixelated' }}
      onError={() => setStage((s) => Math.min(s + 1, sources.length))}
      draggable={false}
    />
  )
}
