import { describe, expect, it } from 'vitest'
import { friendsJoinId } from './join-id'

describe('friendsJoinId', () => {
  it('is a 40-char hex hash that differs from the nonce', () => {
    const nonce = 'ab'.repeat(20)
    const id = friendsJoinId(nonce)
    expect(id).toMatch(/^[0-9a-f]{40}$/)
    expect(id).not.toBe(nonce)
    expect(id).toBe('eb090cff0829e1929947bfbf9fa710e374a41da8')
  })
})
