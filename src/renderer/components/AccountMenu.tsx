import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Account, Profile } from '@shared/types'
import { useUi } from '../store/uiStore'
import { PlayerHead } from './PlayerHead'

/** The sidebar head — click to open an account switcher (switch / add / profile). */
export function AccountMenu({ profile }: { profile: Profile }) {
  const navigate = useNavigate()
  const { setProfile, setPacemanName } = useUi()
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void window.mcsr.auth.accounts().then(setAccounts)
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function switchTo(uuid: string) {
    const p = await window.mcsr.auth.switch(uuid)
    if (p) {
      setProfile(p)
      setPacemanName(p.name)
    }
    setAccounts(await window.mcsr.auth.accounts())
    setOpen(false)
  }

  async function add() {
    try {
      const p = await window.mcsr.auth.login()
      setProfile(p)
      setPacemanName(p.name)
      setAccounts(await window.mcsr.auth.accounts())
    } catch {
      /* cancelled */
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`${profile.name} — accounts`}
        className="block rounded-md"
      >
        <PlayerHead id={profile.uuid} uuid={profile.uuid} size={40} className="rounded-md" />
      </button>

      {open && (
        <div className="absolute bottom-0 left-[52px] z-50 w-56 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-1.5 shadow-2xl">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-faint">Accounts</div>
          {accounts.map((a) => (
            <button
              key={a.uuid}
              onClick={() => (a.active ? (navigate('/profile'), setOpen(false)) : switchTo(a.uuid))}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5"
            >
              <PlayerHead id={a.uuid} uuid={a.uuid} size={22} className="rounded" />
              <span className={a.active ? 'text-text' : 'text-muted'}>{a.name}</span>
              {a.active && <span className="ml-auto text-[10px] text-[var(--gold)]">● active</span>}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--line)]" />
          <button
            onClick={add}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-white/5 hover:text-text"
          >
            <span className="grid h-[22px] w-[22px] place-items-center rounded border border-dashed border-[var(--line)] text-xs">
              +
            </span>
            Add account
          </button>
          <button
            onClick={() => {
              navigate('/settings')
              setOpen(false)
            }}
            className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-faint hover:bg-white/5 hover:text-muted"
          >
            Manage accounts…
          </button>
        </div>
      )}
    </div>
  )
}
