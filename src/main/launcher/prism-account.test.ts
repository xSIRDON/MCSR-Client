import { expect, it } from 'vitest'
import { prismAccounts, readPrismRefresh, readPrismSecrets } from './prism-account'

it('preserves the Microsoft application identity for account migration', () => {
  const value = prismAccounts({ uuid: 'abc', name: 'Player', refreshToken: 'test-refresh' })
  expect(value.accounts[0]['msa-client-id']).toBe('00000000402b5328')
  expect(readPrismRefresh(value)).toEqual({ uuid: 'abc', refreshToken: 'test-refresh' })
  expect(readPrismSecrets(value)).toContain('test-refresh')
})

it('does not accept a token from another OAuth application or an offline account', () => {
  const value = prismAccounts({ uuid: 'abc', name: 'Player', refreshToken: 'test-refresh' })
  value.accounts[0]['msa-client-id'] = 'different-client'
  expect(readPrismRefresh(value)).toBeNull()
  expect(readPrismRefresh({ formatVersion: 3, accounts: [{ type: 'Offline' }] })).toBeNull()
  expect(readPrismRefresh(null)).toBeNull()
})
