type Resp = { ok: boolean; status: number; json(): Promise<unknown> }

let chain: Promise<unknown> = Promise.resolve()
const MIN_GAP_MS = 120

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function politeFetch(url: string): Promise<Resp> {
  const run = chain.then(async () => {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    await delay(MIN_GAP_MS)
    return res
  })
  chain = run.catch(() => undefined)
  return run as Promise<Resp>
}

export function plainFetch(url: string): Promise<Resp> {
  return fetch(url, { headers: { accept: 'application/json' } })
}
