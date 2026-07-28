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
