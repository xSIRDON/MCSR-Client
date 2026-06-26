// A polite, serialized fetch used by the API clients. A small minimum gap
// between requests keeps Obsidian a good citizen of the MCSR API even if the
// query cache is bypassed. The browser Response already matches FetchLike.

type Resp = { ok: boolean; status: number; json(): Promise<unknown> }

let chain: Promise<unknown> = Promise.resolve()
const MIN_GAP_MS = 120

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Serialized, gap-limited fetch. */
export function politeFetch(url: string): Promise<Resp> {
  const run = chain.then(async () => {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    await delay(MIN_GAP_MS)
    return res
  })
  // Keep the chain alive regardless of individual failures.
  chain = run.catch(() => undefined)
  return run as Promise<Resp>
}

/** Unthrottled fetch for paceman polling (separate host, lower stakes). */
export function plainFetch(url: string): Promise<Resp> {
  return fetch(url, { headers: { accept: 'application/json' } })
}
