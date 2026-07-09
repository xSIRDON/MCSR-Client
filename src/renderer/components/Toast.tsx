// In-app toast for a DM that arrived while you were elsewhere. Clicking one opens the rail and
// jumps straight into that conversation. Auto-dismisses after a few seconds.
import { useEffect } from 'react'
import { useMessagesStore } from '../store/messagesStore'
import type { ChatToast } from '../store/messagesStore'
import { useUi } from '../store/uiStore'
import { PlayerHead } from './PlayerHead'

export function ToastHost() {
  const toasts = useMessagesStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: ChatToast }) {
  const dismiss = useMessagesStore((s) => s.dismissToast)
  const openThread = useMessagesStore((s) => s.openThread)
  const setFriendsOpen = useUi((s) => s.setFriendsOpen)

  useEffect(() => {
    const id = window.setTimeout(() => dismiss(toast.id), 6000)
    return () => window.clearTimeout(id)
  }, [toast.id, dismiss])

  return (
    <button
      onClick={() => {
        setFriendsOpen(true)
        openThread(toast.uuid)
        dismiss(toast.id)
      }}
      className="pointer-events-auto flex w-72 items-start gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-3 text-left shadow-lg animate-fade-up transition-colors hover:border-[var(--gold)]/40"
    >
      <PlayerHead id={toast.uuid} uuid={toast.uuid} size={34} className="shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text">{toast.nickname}</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--gold)]">DM</span>
        </div>
        <div className="truncate text-xs text-muted">{toast.body}</div>
      </div>
    </button>
  )
}
