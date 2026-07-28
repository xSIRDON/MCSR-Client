// Integrity-checked downloads for the helper jars the client fetches and then EXECUTES
// (Toolscreen, Ninjabrain Bot, the paceman tracker) or loads into the game JVM (FSG).
//
// GitHub release assets and CDN objects are mutable by whoever owns them: the same URL can
// be re-pointed at different bytes with no version change, and the client would happily
// cache and run the result forever. Pinning the hash makes a swapped artifact a hard
// failure instead of silent code execution. It also removes the value of an HTTPS
// downgrade, since altered bytes can no longer pass.

import { createHash } from 'node:crypto'

export type FetchBuffer = (url: string) => Promise<{ buf: Buffer; finalUrl: string }>

const nodeFetch: FetchBuffer = async (url) => {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  return { buf: Buffer.from(await res.arrayBuffer()), finalUrl: res.url || url }
}

export function sha512Of(buf: Buffer): string {
  return createHash('sha512').update(buf).digest('hex')
}

/**
 * Download `url` and return its bytes only if they match `sha512` and the request never
 * left HTTPS. Throws otherwise — callers must not fall back to the unverified bytes.
 */
export async function fetchVerified(
  url: string,
  sha512: string,
  label: string,
  fetchBuffer: FetchBuffer = nodeFetch
): Promise<Buffer> {
  const { buf, finalUrl } = await fetchBuffer(url)
  if (!finalUrl.startsWith('https://')) {
    throw new Error(`${label}: refusing insecure redirect to ${finalUrl}`)
  }
  const got = sha512Of(buf)
  if (got !== sha512) {
    throw new Error(`${label}: sha512 mismatch — expected ${sha512.slice(0, 16)}…, got ${got.slice(0, 16)}…`)
  }
  return buf
}
