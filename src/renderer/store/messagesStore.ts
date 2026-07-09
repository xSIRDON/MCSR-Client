import { create } from 'zustand'
import { useEffect } from 'react'
import type { MessageStore } from '@shared/types'

export interface ChatToast {
  id: number
  uuid: string
  nickname: string
  body: string
}

interface MessagesState {
  store: MessageStore
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

export function useTotalUnread(): number {
  const unread = useMessagesStore((s) => s.store.unread)
  return Object.values(unread).reduce((a, b) => a + b, 0)
}

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
