const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

export function isSafeExternalUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url === '') return false
  try {
    return SAFE_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export function isSameOrigin(target: unknown, current: unknown): boolean {
  if (typeof target !== 'string' || typeof current !== 'string') return false
  if (!target || !current) return false
  let t: URL
  let c: URL
  try {
    t = new URL(target)
    c = new URL(current)
  } catch {
    return false
  }
  if (t.protocol !== c.protocol) return false
  if (t.protocol === 'file:') {
    const dir = (u: URL): string => u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1)
    return dir(t) === dir(c)
  }
  return t.origin === c.origin
}
