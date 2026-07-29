import { describe, it, expect } from 'vitest'
import { nextReceiptBatch } from './receipt-batch'

describe('nextReceiptBatch', () => {
  it('returns everything when pending fits in one batch', () => {
    expect(nextReceiptBatch([1, 2, 3], 0, 100)).toEqual({ batch: [1, 2, 3], nextCursor: 0 })
  })

  it('handles an empty pending list', () => {
    expect(nextReceiptBatch([], 5, 100)).toEqual({ batch: [], nextCursor: 0 })
  })

  it('rotates so every id is polled across successive calls', () => {
    const pending = Array.from({ length: 250 }, (_, i) => i + 1)
    const seen = new Set<number>()
    let cursor = 0
    for (let round = 0; round < 3; round++) {
      const { batch, nextCursor } = nextReceiptBatch(pending, cursor, 100)
      expect(batch).toHaveLength(100)
      for (const id of batch) seen.add(id)
      cursor = nextCursor
    }
    expect(seen.size).toBe(250) // 3 rounds of 100 over 250 ids covers all of them
  })

  it('wraps around rather than truncating at the end', () => {
    const { batch } = nextReceiptBatch([10, 20, 30, 40, 50], 3, 3)
    expect(batch).toEqual([40, 50, 10])
  })

  it('tolerates a stale cursor beyond the list length', () => {
    const { batch, nextCursor } = nextReceiptBatch([1, 2, 3], 999, 2)
    expect(batch).toHaveLength(2)
    expect(nextCursor).toBeGreaterThanOrEqual(0)
    expect(nextCursor).toBeLessThan(3)
  })
})
