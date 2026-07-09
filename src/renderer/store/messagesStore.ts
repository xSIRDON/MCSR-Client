// Renderer-side DM state: the message cache the main process owns, which thread is open, and
// the toast queue. The main process is the source of truth; this store just mirrors its pushes.
import { create } from 'zustand'
import { useEffect } from 'react'
import type { FriendMessage, MessageStore } from '@shared/types'

// A single shared empty array for conversations with no messages. Returning a fresh `[]` from a
// zustand selector on every call gives it a new identity each render, which zustand reads as a
// changed snapshot and spins into an infinite render loop — so always hand back this constant.
const EMPTY_THREAD: FriendMessage[] = []

/** This friend's message list, or a stable shared empty array (never a fresh one — see above). */
export function threadOf(byFriend: MessageStore['byFriend'], uuid: string): FriendMessage[] {
  return byFriend[uuid] ?? EMPTY_THREAD
}

export interface ChatToast {
  id: number
  uuid: string
  nickname: string
  body: string
}

interface MessagesState {
  store: MessageStore
  /** uuid of the friend whose DM thread is open in the rail, or null. */
  activeThread: string | null
  toasts: ChatToast[]
  setStore: (s: MessageStore) => void
  openThread: (uuid: string) => void
  closeThread: () => void
  pushToast: (t: Omit<ChatToast, 'id'>) => void
  dismissToast: (id: number) => void
}

let nextToastId = 0

export const useMessagesStore = create<MessagesState>((set) => ({
  store: { byFriend: {}, unread: {} },
  activeThread: null,
  toasts: [],
  setStore: (store) => set({ store }),
  openThread: (uuid) => set({ activeThread: uuid }),
  closeThread: () => set({ activeThread: null }),
  pushToast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: ++nextToastId }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}))

/** Total unread across all conversations, for the tab/rail badges. */
export function useTotalUnread(): number {
  const unread = useMessagesStore((s) => s.store.unread)
  return Object.values(unread).reduce((a, b) => a + b, 0)
}

/**
 * Wire the main-process DM stream into the store. Mount ONCE at the app root. A `toast` push is
 * only surfaced when its thread isn't the one currently open, so you never get toasted for the
 * chat you're actively reading.
 */
export function useMessagesBridge(): void {
  const setStore = useMessagesStore((s) => s.setStore)
  const pushToast = useMessagesStore((s) => s.pushToast)
  useEffect(() => {
    let active = true
    void window.mcsr.friends.messages().then((s) => {
      if (active) setStore(s)
    })
    const off = window.mcsr.friends.onMessages((e) => {
      setStore(e.store)
      if (e.toast && e.toast.uuid !== useMessagesStore.getState().activeThread) {
        pushToast(e.toast)
      }
    })
    return () => {
      active = false
      off()
    }
  }, [setStore, pushToast])
}
