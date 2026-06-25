import { describe, it, expect, vi } from 'vitest'
import { createMcsrClient, McsrApiError, avatarUrl, type FetchLike } from './mcsr-ranked'

function stub(payload: unknown, ok = true, status = 200): FetchLike {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => payload
  }))
}

describe('createMcsrClient', () => {
  it('unwraps the success envelope and returns data', async () => {
    const fetchImpl = stub({ status: 'success', data: { uuid: 'abc', nickname: 'Feinberg', eloRate: 1850, eloRank: 12 } })
    const client = createMcsrClient(fetchImpl)
    const user = await client.getUser('Feinberg')
    expect(user).toMatchObject({ nickname: 'Feinberg', eloRate: 1850 })
  })

  it('builds the correct user URL', async () => {
    const fetchImpl = stub({ status: 'success', data: {} })
    const client = createMcsrClient(fetchImpl, 'https://api.mcsrranked.com')
    await client.getUser('Some Name')
    expect(fetchImpl).toHaveBeenCalledWith('https://api.mcsrranked.com/users/Some%20Name')
  })

  it('passes matches query params', async () => {
    const fetchImpl = stub({ status: 'success', data: [] })
    const client = createMcsrClient(fetchImpl)
    await client.getMatches('Feinberg', { type: 2, count: 20 })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.mcsrranked.com/users/Feinberg/matches?type=2&count=20'
    )
  })

  it('throws McsrApiError on an error envelope', async () => {
    const fetchImpl = stub({ status: 'error', data: 'not found' }, true, 200)
    const client = createMcsrClient(fetchImpl)
    await expect(client.getUser('nobody')).rejects.toBeInstanceOf(McsrApiError)
  })

  it('throws McsrApiError on a non-ok response', async () => {
    const fetchImpl = stub({ status: 'error', data: 'rate limited' }, false, 429)
    const client = createMcsrClient(fetchImpl)
    await expect(client.getLive()).rejects.toMatchObject({ status: 429 })
  })
})

describe('avatarUrl', () => {
  it('builds an mc-heads url', () => {
    expect(avatarUrl('Feinberg', 128)).toBe('https://mc-heads.net/avatar/Feinberg/128')
  })
})
