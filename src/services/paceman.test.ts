import { describe, it, expect, vi } from 'vitest'
import { createPacemanClient, SPLIT_ORDER, type FetchLike } from './paceman'

function stub(payload: unknown, ok = true, status = 200): FetchLike {
  return vi.fn(async () => ({ ok, status, json: async () => payload }))
}

describe('createPacemanClient', () => {
  it('builds the getRecentRuns url with name and default limit', async () => {
    const fetchImpl = stub([])
    const client = createPacemanClient(fetchImpl)
    await client.getRecentRuns('xSIRDON')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://paceman.gg/stats/api/getRecentRuns?name=xSIRDON&limit=1'
    )
  })

  it('returns parsed recent runs', async () => {
    const fetchImpl = stub([{ id: 1, nether: 90000, bastion: null, time: 95000 }])
    const client = createPacemanClient(fetchImpl)
    const runs = await client.getRecentRuns('xSIRDON', { limit: 1 })
    expect(runs[0]).toMatchObject({ id: 1, nether: 90000 })
  })

  it('builds the getWorld url', async () => {
    const fetchImpl = stub({ data: {}, time: 0, isLive: true })
    const client = createPacemanClient(fetchImpl)
    const w = await client.getWorld(42)
    expect(fetchImpl).toHaveBeenCalledWith('https://paceman.gg/stats/api/getWorld/?worldId=42')
    expect(w.isLive).toBe(true)
  })

  it('throws on non-ok', async () => {
    const fetchImpl = stub({}, false, 500)
    const client = createPacemanClient(fetchImpl)
    await expect(client.getSessionStats('x')).rejects.toThrow()
  })
})

describe('SPLIT_ORDER', () => {
  it('lists the seven splits in order', () => {
    expect(SPLIT_ORDER.map((s) => s.key)).toEqual([
      'nether',
      'bastion',
      'fortress',
      'first_portal',
      'stronghold',
      'end',
      'finish'
    ])
  })
})
