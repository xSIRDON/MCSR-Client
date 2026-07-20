import { useEffect, useState } from 'react'
import type { InstanceId } from '@shared/types'

const TITLES: Record<InstanceId, string> = { ranked: 'Ranked', rsg: 'RSG', zsg: 'ZSG' }

/** One-time opt-in: offer extra-options to already-installed RSG/ZSG instances that lack it. */
export function ExtraOptionsPrompt() {
  const [prompt, setPrompt] = useState<{ show: boolean; instances: InstanceId[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.mcsr.instances.extraOptionsPrompt().then(setPrompt)
  }, [])

  if (!prompt || !prompt.show) return null

  async function addIt() {
    setBusy(true)
    setError(null)
    try {
      await window.mcsr.instances.addExtraOptions(prompt!.instances)
      await window.mcsr.instances.dismissExtraOptionsPrompt()
      setPrompt({ show: false, instances: [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the mod. Try again from Edit instance.')
      setBusy(false)
    }
  }

  async function dismiss() {
    await window.mcsr.instances.dismissExtraOptionsPrompt()
    setPrompt({ show: false, instances: [] })
  }

  const names = prompt.instances.map((i) => TITLES[i]).join(' and ')

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 animate-fade-up"
      onClick={() => !busy && void dismiss()}
    >
      <div className="surface w-full max-w-[440px] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg tracking-wide text-text">Add the extra-options mod?</h2>
        <p className="mt-2 text-sm text-muted">
          <span className="text-text">extra-options</span> is a legal MCSR mod. Add it to your
          installed {names} instance{prompt.instances.length === 1 ? '' : 's'}?
        </p>
        {error && <div className="mt-2 text-xs text-[var(--loss)]">{error}</div>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => void dismiss()}
            disabled={busy}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            No thanks
          </button>
          <button
            onClick={() => void addIt()}
            disabled={busy}
            className="font-display rounded-lg px-5 py-2 text-sm tracking-wide text-[#07140a] disabled:opacity-60"
            style={{
              background: 'linear-gradient(180deg,#6fcf57,#4ea73e)',
              boxShadow: '0 8px 24px rgba(94,167,62,.4), inset 0 1px 0 rgba(255,255,255,.25)'
            }}
          >
            {busy ? 'Adding…' : 'Add it'}
          </button>
        </div>
      </div>
    </div>
  )
}
