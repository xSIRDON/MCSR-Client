import { useEffect, useState } from 'react'
import type { AppConfig, TrackerStatus } from '@shared/types'
import { useUi } from '../store/uiStore'

export function Settings() {
  const { profile, setProfile, pacemanName, setPacemanName } = useUi()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [tracker, setTracker] = useState<TrackerStatus>({ running: false, hasKey: false })
  const [keyInput, setKeyInput] = useState('')
  const [nameInput, setNameInput] = useState(pacemanName ?? '')
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    void window.obsidian.config.get().then(setConfig)
    void window.obsidian.paceman.status().then(setTracker)
    const off = window.obsidian.paceman.onStatusChanged(setTracker)
    return off
  }, [])

  function patch(p: Partial<AppConfig>) {
    void window.obsidian.config.set(p).then(setConfig)
  }
  function flash(msg: string) {
    setSaved(msg)
    setTimeout(() => setSaved(null), 1600)
  }

  async function saveKey() {
    if (!keyInput.trim()) return
    await window.obsidian.paceman.setKey(keyInput.trim())
    setKeyInput('')
    flash('Paceman key saved')
  }

  async function pickJar() {
    const f = await window.obsidian.config.pickJar()
    if (f) {
      flash('SeedQueue override set')
      void window.obsidian.config.get().then(setConfig)
    }
  }

  async function logout() {
    await window.obsidian.auth.logout()
    setProfile(null)
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-5 px-7 py-7">
      <h1 className="font-display text-2xl tracking-wide text-text">Settings</h1>

      {/* Account */}
      <Card title="Account">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">
            Signed in as <span className="text-text">{profile?.name ?? '—'}</span>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-[var(--loss)]"
          >
            Sign out
          </button>
        </div>
      </Card>

      {/* Memory */}
      <Card title="Game memory">
        {config && (
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted">Allocated RAM</span>
              <span className="font-display text-text">{(config.ramMb / 1024).toFixed(1)} GB</span>
            </div>
            <input
              type="range"
              min={2048}
              max={12288}
              step={512}
              value={config.ramMb}
              onChange={(e) => setConfig({ ...config, ramMb: Number(e.target.value) })}
              onMouseUp={(e) => patch({ ramMb: Number((e.target as HTMLInputElement).value) })}
              className="w-full accent-[var(--gold)]"
            />
            <div className="mt-1 text-xs text-faint">3–4 GB is plenty for 1.16.1 + SeedQueue.</div>
          </div>
        )}
      </Card>

      {/* Paceman */}
      <Card title="Paceman (RSG pace tracking)">
        <div className="flex items-center gap-2 text-xs">
          <Dot ok={tracker.hasKey} />
          <span className="text-muted">{tracker.hasKey ? 'Access key saved' : 'No access key yet'}</span>
          <span className="mx-2 text-faint">·</span>
          <Dot ok={tracker.running} />
          <span className="text-muted">{tracker.running ? 'Tracker running' : 'Tracker idle'}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Paste your paceman.gg access key"
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-sm text-text outline-none focus:border-[var(--gold)]/40"
          />
          <button
            onClick={saveKey}
            className="font-display rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-[#0a0a10]"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-xs text-faint">
          Get a key at paceman.gg → sign in with Discord → Generate Access Token. The tracker starts
          automatically when you launch RSG — no Julti or Jingle needed.
        </p>

        <div className="mt-4">
          <label className="mb-1 block text-xs text-muted">Paceman / Minecraft name for live pace</label>
          <div className="flex gap-2">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={profile?.name ?? 'username'}
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-sm text-text outline-none focus:border-[var(--gold)]/40"
            />
            <button
              onClick={() => {
                const v = nameInput.trim() || profile?.name || null
                patch({ pacemanName: v })
                setPacemanName(v)
                flash('Saved')
              }}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-muted hover:text-text"
            >
              Save
            </button>
          </div>
        </div>
      </Card>

      {/* SeedQueue override */}
      <Card title="SeedQueue (RSG)">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm text-muted">
            {config?.seedQueueOverride ? (
              <>
                Override:{' '}
                <span className="break-all text-text">{config.seedQueueOverride}</span>
              </>
            ) : (
              'Using the version pinned by the MCSR pack (1.7.1). Drop in a Discord beta to override.'
            )}
          </div>
          <button
            onClick={pickJar}
            className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-text"
          >
            Choose jar…
          </button>
        </div>
        {config?.seedQueueOverride && (
          <button
            onClick={() => patch({ seedQueueOverride: null })}
            className="mt-2 text-xs text-faint hover:text-[var(--loss)]"
          >
            Clear override
          </button>
        )}
      </Card>

      {saved && (
        <div className="fixed bottom-5 right-5 rounded-lg bg-[var(--win)]/15 px-4 py-2 text-sm text-[var(--win)] ring-1 ring-[var(--win)]/30">
          {saved}
        </div>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5">
      <h2 className="mb-3 font-display text-sm uppercase tracking-[0.16em] text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: ok ? 'var(--win)' : 'var(--faint)' }}
    />
  )
}
