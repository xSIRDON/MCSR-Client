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
