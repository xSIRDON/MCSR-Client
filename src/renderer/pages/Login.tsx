import { useState } from 'react'
import { useUi } from '../store/uiStore'
import { NetheriteBlock, PortalBlock } from '../components/BlockArt'

export function Login() {
  const { setProfile, setPacemanName } = useUi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      const p = await window.mcsr.auth.login()
      setProfile(p)
      setPacemanName(p.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative grid flex-1 place-items-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full bg-[var(--gold)]/10 blur-[100px]" />
        <div className="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-[var(--portal)]/15 blur-[110px]" />
      </div>

      <div className="relative w-[380px] text-center animate-fade-up">
        <div className="mb-5 flex items-center justify-center gap-2">
          <NetheriteBlock size={34} />
          <PortalBlock size={34} />
        </div>
        <h1 className="font-display text-4xl tracking-[0.14em] text-text">MCSR CLIENT</h1>
        <p className="mt-2 text-sm text-muted">The clean MCSR client — Ranked &amp; RSG, one place.</p>

        <button
          onClick={signIn}
          disabled={busy}
          className="font-display mt-8 w-full rounded-xl bg-[var(--gold)] px-5 py-3 text-sm text-[#0a0a10] shadow-[0_8px_28px_var(--gold-glow)] transition-all hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'OPENING MICROSOFT…' : 'SIGN IN WITH MICROSOFT'}
        </button>

        {error && <div className="mt-4 text-sm text-[var(--loss)]">{error}</div>}

        <p className="mt-6 text-xs text-faint">
          Requires a Minecraft: Java Edition account. Your login stays on this device.
        </p>
      </div>
    </div>
  )
}
