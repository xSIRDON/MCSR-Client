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
      'https://paceman.gg/stats/api/getRecentRuns/?name=xSIRDON&limit=1'
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

  it('builds the getPBs url from uuids', async () => {
    const fetchImpl = stub([])
    const client = createPacemanClient(fetchImpl)
    await client.getPBs(['aaa-bbb', 'ccc-ddd'])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://paceman.gg/stats/api/getPBs/?uuids=aaa-bbb%2Cccc-ddd'
    )
  })

  it('getPB resolves name -> uuid -> PB', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes('getSessionNethers')
          ? { count: 3, avg: '6:01', rnph: 0, uuid: 'the-uuid' }
          : [{ finish: 612345, uuid: 'the-uuid', timestamp: 1716945293, name: 'Me', pb: '10:12' }]
    })) as FetchLike
    const client = createPacemanClient(fetchImpl)
    const pb = await client.getPB('Me')
    expect(pb).toMatchObject({ finish: 612345, pb: '10:12' })
  })

  it('getPB returns null for unknown players instead of throwing', async () => {
    const fetchImpl = stub({ error: 'Unknown user' }, false, 404)
    const client = createPacemanClient(fetchImpl)
    await expect(client.getPB('nobody')).resolves.toBeNull()
  })

  it('getPB rethrows transient failures so callers can retry', async () => {
    const fetchImpl = stub({}, false, 502)
    const client = createPacemanClient(fetchImpl)
    await expect(client.getPB('Me')).rejects.toThrow('502')
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
