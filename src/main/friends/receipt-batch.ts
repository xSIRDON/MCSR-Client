// The receipts endpoint answers at most 100 ids per query, so with more than 100 sent
// messages still awaiting a read receipt a fixed slice(0, 100) polls the oldest hundred
// forever and everything newer never flips to Seen. Rotate a cursor through the pending
// set instead so every id gets its turn across successive polls.

export function nextReceiptBatch(
  pending: number[],
  cursor: number,
  limit = 100
): { batch: number[]; nextCursor: number } {
  if (pending.length === 0) return { batch: [], nextCursor: 0 }
  const start = ((cursor % pending.length) + pending.length) % pending.length
  const batch: number[] = []
  for (let i = 0; i < Math.min(limit, pending.length); i++) {
    batch.push(pending[(start + i) % pending.length])
  }
  return { batch, nextCursor: (start + batch.length) % pending.length }
}
