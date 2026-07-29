// Per-key FIFO execution. Several IPC handlers mutate the same instance directory
// (installInstance rewrites it wholesale; syncMaps edits saves/ plus a manifest), and the
// renderer can invoke them concurrently — so every mutating operation on an instance goes
// through one of these queues: run(key, fn) waits for every prior run with the same key.

export interface KeyedQueue<K extends string> {
  run<T>(key: K, fn: () => Promise<T> | T): Promise<T>
}

export function createKeyedQueue<K extends string>(keys: readonly K[]): KeyedQueue<K> {
  const chains = new Map<K, Promise<unknown>>()
  for (const k of keys) chains.set(k, Promise.resolve())
  return {
    run<T>(key: K, fn: () => Promise<T> | T): Promise<T> {
      const prev = chains.get(key) ?? Promise.resolve()
      const next = prev.then(fn)
      chains.set(key, next.catch(() => undefined)) // a failure must not wedge the key
      return next
    }
  }
}
