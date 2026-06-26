import { useEffect, useRef, useState } from 'react'
import type { LogLine } from '@shared/types'

/** Live console: boot logs, mod loading, and the running game's output. */
export function Console() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [autoscroll, setAutoscroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void window.mcsr.logs.history().then((h) => {
      if (active) setLines(h)
    })
    const off = window.mcsr.logs.onLine((l) => setLines((prev) => [...prev.slice(-1999), l]))
    return () => {
      active = false
      off()
    }
  }, [])

  useEffect(() => {
    if (autoscroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoscroll])

  async function clear() {
    await window.mcsr.logs.clear()
    setLines([])
  }

  return (
    <div className="flex h-full flex-col px-5 py-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl tracking-wide text-text">Console</h1>
          <p className="text-xs text-muted">Boot, mod loading, and live game output.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(e) => setAutoscroll(e.target.checked)}
              className="accent-[var(--gold)]"
            />
            Auto-scroll
          </label>
          <button
            onClick={clear}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-text"
          >
            Clear
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--line)] bg-black/40 p-3 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="text-faint">No output yet — launch an instance to see boot and live logs here.</div>
        ) : (
          lines.map((l, i) => (
            <div
              key={i}
              className="whitespace-pre-wrap break-all"
              style={{ color: l.source === 'system' ? 'var(--gold)' : 'var(--muted)' }}
            >
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
