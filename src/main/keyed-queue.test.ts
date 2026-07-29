import { describe, it, expect } from 'vitest'
import { createKeyedQueue } from './keyed-queue'

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createKeyedQueue', () => {
  it('runs same-key tasks strictly one after another', async () => {
    const q = createKeyedQueue(['a', 'b'] as const)
    const gate = deferred<void>()
    const order: string[] = []
    const first = q.run('a', async () => {
      order.push('first:start')
      await gate.promise
      order.push('first:end')
    })
    const second = q.run('a', async () => {
      order.push('second:start')
    })
    // Give the second task every chance to start early if serialization is broken.
    await new Promise((r) => setTimeout(r, 20))
    expect(order).toEqual(['first:start'])
    gate.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('lets different keys run concurrently', async () => {
    const q = createKeyedQueue(['a', 'b'] as const)
    const gate = deferred<void>()
    const order: string[] = []
    const slow = q.run('a', async () => {
      await gate.promise
      order.push('a')
    })
    await q.run('b', async () => {
      order.push('b')
    })
    expect(order).toEqual(['b'])
    gate.resolve()
    await slow
    expect(order).toEqual(['b', 'a'])
  })

  it('propagates the return value and the rejection to the caller', async () => {
    const q = createKeyedQueue(['a'] as const)
    await expect(q.run('a', async () => 42)).resolves.toBe(42)
    await expect(q.run('a', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('keeps serving a key after a task on it failed', async () => {
    const q = createKeyedQueue(['a'] as const)
    await q.run('a', () => Promise.reject(new Error('boom'))).catch(() => undefined)
    await expect(q.run('a', async () => 'alive')).resolves.toBe('alive')
  })
})
