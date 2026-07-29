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
      chains.set(key, next.catch(() => undefined))
      return next
    }
  }
}
