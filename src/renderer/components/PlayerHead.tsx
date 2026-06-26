import { useQuery } from '@tanstack/react-query'

interface Props {
  /** username or dashless uuid */
  id: string
  /** dashed-or-dashless uuid for the resolver, if available */
  uuid?: string
  size?: number
  render?: 'avatar' | 'body'
  className?: string
}

/** Resolve a head/body via the main-process skin proxy (cached, multi-host, concurrency-limited). */
function useSkin(raw: string, size: number, kind: 'avatar' | 'body', enabled: boolean) {
  return useQuery({
    queryKey: ['skin', kind, raw, size],
    queryFn: async () => {
      const u = await window.mcsr.skins.get(raw, size, kind)
      if (!u) throw new Error('skin unavailable')
      return u
    },
    enabled: enabled && raw.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (n) => 600 * (n + 1)
  })
}

/**
 * Player head/body. Skins are resolved and cached by the main process (multi-host fallback,
 * concurrency-limited, disk-cached) so a whole leaderboard loads without bursting the hosts.
 * A body render falls back to the (square) face if the body hosts fail, and to a letter block
 * only if even the face is unavailable.
 */
export function PlayerHead({ id, uuid, size = 64, render = 'avatar', className }: Props) {
  const raw = (uuid ?? id).replace(/-/g, '')
  const wantBody = render === 'body'

  const body = useSkin(raw, size, 'body', wantBody)
  // The face doubles as the body's fallback; only fetched for an avatar render or a failed body.
  const face = useSkin(raw, size, 'avatar', !wantBody || body.isError)

  const bodyUrl = wantBody ? body.data : undefined
  const url = bodyUrl ?? face.data
  const tall = !!bodyUrl // a real body render is 2x tall; a face fallback stays square

  if (url) {
    return (
      <img
        src={url}
        alt={id}
        width={size}
        height={tall ? size * 2 : size}
        className={`pixelated ${className ?? ''}`}
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />
    )
  }

  return (
    <div
      className={`pixelated grid place-items-center rounded-md ${className ?? ''}`}
      style={{
        width: size,
        height: wantBody ? size * 2 : size,
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
