import { describe, it, expect, vi } from 'vitest'
import {
  createMcsrClient,
  McsrApiError,
  avatarUrl,
  donorInfo,
  rankedStats,
  type FetchLike,
  type McsrUser
} from './mcsr-ranked'

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

  it('passes the season filter to users and matches', async () => {
    const fetchImpl = stub({ status: 'success', data: [] })
    const client = createMcsrClient(fetchImpl)
    await client.getUser('Feinberg', { season: 7 })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.mcsrranked.com/users/Feinberg?season=7')
    await client.getMatches('Feinberg', { type: 2, count: 20, season: 7 })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.mcsrranked.com/users/Feinberg/matches?type=2&count=20&season=7'
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

describe('donorInfo', () => {
  it('maps roleType to the Stone / Iron / Diamond donor tiers', () => {
    expect(donorInfo(1)?.tier).toBe('stone')
    expect(donorInfo(2)?.tier).toBe('iron')
    expect(donorInfo(3)?.tier).toBe('diamond')
    expect(donorInfo(3)?.label).toBe('Diamond')
  })

  it('returns null for non-donors and unknown role types', () => {
    expect(donorInfo(0)).toBeNull()
    expect(donorInfo(null)).toBeNull()
    expect(donorInfo(undefined)).toBeNull()
    expect(donorInfo(99)).toBeNull()
  })
})

describe('rankedStats', () => {
  const user = {
    uuid: 'u',
    nickname: 'n',
    eloRate: 1000,
    eloRank: 1,
    statistics: {
      season: {
        playedMatches: { ranked: 186, casual: 2 },
        completions: { ranked: 47, casual: 0 },
        completionTime: { ranked: 34024940, casual: 0 },
        forfeits: { ranked: 45, casual: 1 }
      },
      total: { playedMatches: { ranked: 0, casual: 0 } }
    }
  } as McsrUser

  it('averages finish time over completions and rates forfeits over matches played', () => {
    const s = rankedStats(user)
    expect(s.averageTime).toBe(723935) // 12:03.935
    expect(s.completions).toBe(47)
    expect(s.forfeits).toBe(45)
    expect(s.forfeitRate).toBe(24.2)
  })

  it('has no average or rate without completions or matches', () => {
    const s = rankedStats(user, 'total')
    expect(s.averageTime).toBeNull()
    expect(s.forfeitRate).toBeNull()
    expect(rankedStats(undefined).forfeitRate).toBeNull()
  })
})
