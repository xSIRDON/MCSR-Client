type Resp = { ok: boolean; status: number; json(): Promise<unknown> }

let chain: Promise<unknown> = Promise.resolve()
const MIN_GAP_MS = 120
const TIMEOUT_MS = 15_000
const DEFAULT_RETRY_AFTER_S = 10

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function get(url: string): Promise<Response> {
  return fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

export function politeFetch(url: string): Promise<Resp> {
  const run = chain.then(async () => {
    let res = await get(url)
    if (res.status === 429) {
      const after = Number(res.headers.get('retry-after'))
      await delay(Math.min(60, Number.isFinite(after) && after > 0 ? after : DEFAULT_RETRY_AFTER_S) * 1000)
      res = await get(url)
    }
    await delay(MIN_GAP_MS)
    return res
  })
  chain = run.catch(() => undefined)
  return run as Promise<Resp>
}

export function plainFetch(url: string): Promise<Resp> {
  return fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
}
