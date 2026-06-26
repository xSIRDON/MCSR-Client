import { useQuery } from '@tanstack/react-query'

interface Props {
  id: string
  uuid?: string
  size?: number
  render?: 'avatar' | 'body'
  className?: string
}

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

export function PlayerHead({ id, uuid, size = 64, render = 'avatar', className }: Props) {
  const raw = (uuid ?? id).replace(/-/g, '')
  const wantBody = render === 'body'

  const body = useSkin(raw, size, 'body', wantBody)
  const face = useSkin(raw, size, 'avatar', !wantBody || body.isError)

  const bodyUrl = wantBody ? body.data : undefined
  const url = bodyUrl ?? face.data
  const tall = !!bodyUrl

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
