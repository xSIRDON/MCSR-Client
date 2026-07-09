import { describe, it, expect } from 'vitest'
import { threadOf } from './messagesStore'
import type { FriendMessage, MessageStore } from '@shared/types'

const msg = (id: number, from: string, to: string): FriendMessage => ({
  id,
  from,
  to,
  body: 'gg',
  at: 1_000 + id,
  read: true
})

describe('threadOf', () => {
  it('returns the SAME empty-array reference for an unseen conversation', () => {
    // Regression: returning a fresh `[]` here (e.g. `byFriend[uuid] ?? []` inside a zustand
    // selector) changes identity every render and infinite-loops the renderer, freezing the app.
    const store: MessageStore = { byFriend: {}, unread: {} }
    expect(threadOf(store.byFriend, 'abc')).toBe(threadOf(store.byFriend, 'abc'))
    expect(threadOf(store.byFriend, 'abc')).toEqual([])
  })

  it('returns the friend’s own message array when present', () => {
    const thread = [msg(1, 'x', 'me'), msg(2, 'me', 'x')]
    const store: MessageStore = { byFriend: { x: thread }, unread: { x: 1 } }
    expect(threadOf(store.byFriend, 'x')).toBe(thread)
  })
})
