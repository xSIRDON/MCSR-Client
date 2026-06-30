import { useEffect, useState } from 'react'
import type { Account, AppConfig, JavaInfo, TrackerStatus, UpdateStatus } from '@shared/types'
import { useUi } from '../store/uiStore'
import { PlayerHead } from '../components/PlayerHead'

export function Settings() {
  const { profile, setProfile, pacemanName, setPacemanName } = useUi()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [tracker, setTracker] = useState<TrackerStatus>({ running: false, hasKey: false })
  const [java, setJava] = useState<JavaInfo | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [nameInput, setNameInput] = useState(pacemanName ?? '')
  const [saved, setSaved] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    void window.mcsr.config.get().then(setConfig)
    void window.mcsr.paceman.status().then(setTracker)
    void window.mcsr.system.java().then(setJava)
    void window.mcsr.auth.accounts().then(setAccounts)
    void window.mcsr.updater.status().then(setUpdate)
    const offPace = window.mcsr.paceman.onStatusChanged(setTracker)
    const offUpd = window.mcsr.updater.onStatusChanged(setUpdate)
    return () => {
      offPace()
      offUpd()
    }
  }, [])

  function patch(p: Partial<AppConfig>) {
    void window.mcsr.config.set(p).then(setConfig)
  }
  function flash(msg: string) {
    setSaved(msg)
    setTimeout(() => setSaved(null), 1600)
  }

  async function saveKey() {
    if (!keyInput.trim()) return
    await window.mcsr.paceman.setKey(keyInput.trim())
    setKeyInput('')
    // A key means paceman is connected — default live lookups to the IGN (if no name was set)
    // so the home PB / live pace light up immediately, without a second step.
    if (!pacemanName && profile?.name) setPacemanName(profile.name)
    flash('Paceman connected')
  }

  async function pickJar() {
    const f = await window.mcsr.config.pickJar()
    if (f) {
      flash('SeedQueue override set')
      void window.mcsr.config.get().then(setConfig)
    }
  }

  async function refreshAccounts() {
    setAccounts(await window.mcsr.auth.accounts())
  }
  async function addAccount() {
    try {
      const p = await window.mcsr.auth.login()
      setProfile(p)
      await refreshAccounts()
      flash('Account added')
    } catch {
      flash('Sign-in cancelled')
    }
  }
  async function switchTo(uuid: string) {
    const p = await window.mcsr.auth.switch(uuid)
    if (p) {
      setProfile(p)
    }
    await refreshAccounts()
  }
  async function removeAccount(uuid: string) {
    const list = await window.mcsr.auth.remove(uuid)
    setAccounts(list)
    const active = list.find((a) => a.active)
    if (!active) {
      setProfile(null)
    } else {
      const p = await window.mcsr.auth.switch(active.uuid)
      if (p) {
        setProfile(p)
      }
    }
  }

  return (
    <div className="mx-auto max-w-[740px] space-y-4 px-5 py-5">
      <h1 className="font-display text-xl tracking-wide text-text">Settings</h1>

      {/* Accounts */}
      <Card title="Accounts">
        <div className="space-y-1.5">
          {accounts.length === 0 ? (
            <div className="text-sm text-muted">No accounts yet — add one to sign in.</div>
          ) : (
            accounts.map((a) => (
              <div
                key={a.uuid}
                className="flex items-center justify-between rounded-md border px-3 py-2"
                style={{ borderColor: a.active ? 'var(--gold)' : 'var(--line)' }}
              >
                <div className="flex items-center gap-2.5">
                  <PlayerHead id={a.uuid} uuid={a.uuid} size={26} className="rounded" />
                  <span className={a.active ? 'text-sm text-text' : 'text-sm text-muted'}>{a.name}</span>
                  {a.active && (
                    <span className="rounded-full bg-[var(--gold)]/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--gold)]">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!a.active && (
                    <button
                      onClick={() => switchTo(a.uuid)}
                      className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm text-muted hover:text-text"
                    >
                      Switch
                    </button>
                  )}
                  <button
                    onClick={() => removeAccount(a.uuid)}
                    className="text-xs text-faint hover:text-[var(--loss)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <button
          onClick={addAccount}
          className="mt-3 rounded-lg border border-dashed border-[var(--line)] px-3 py-2 text-sm text-muted hover:text-text"
        >
          + Add account
        </button>
      </Card>

      {/* Java runtime for the bundled tools */}
      <Card title="Java runtime (for tools)">
        <div className="flex items-center gap-2 text-sm">
          <Dot ok={!!java?.ok} />
          <span className="text-muted">
            {java === null
              ? 'Checking…'
              : !java.found
                ? 'No system Java found on PATH'
                : `Java ${java.version}`}
          </span>
        </div>
        <p className="mt-2 text-xs text-faint">
          The bundled tools (paceman tracker — Ninjabrain Bot later) need Java 17+. The game itself is
          unaffected; it runs on its own bundled Java 8.
          {java && !java.ok && (
            <>
              {' '}
              Install{' '}
              <a
                href="https://adoptium.net/temurin/releases/?version=17"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--gold)] underline"
              >
                Temurin 17
              </a>
              .
            </>
          )}
        </p>
      </Card>

      {/* Per-instance memory lives on each instance's Manage page. */}
      <Card title="Game memory">
        <div className="text-sm text-muted">
          RAM is now set per instance. Open an instance’s <span className="text-text">Manage</span>{' '}
          page (Play → Manage) to adjust Ranked and RSG independently.
        </div>
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
                const v = nameInput.trim() || null
                patch({ pacemanName: v })
                setPacemanName(v)
                flash(v ? 'Paceman connected' : 'Paceman disconnected')
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

      {/* App updates */}
      <Card title="Updates">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Dot ok={update.state === 'up-to-date' || update.state === 'ready'} />
            <span className="truncate text-muted">
              {update.state === 'checking'
                ? 'Checking for updates…'
                : update.state === 'downloading'
                  ? `Downloading v${update.version ?? ''}… ${update.progress ?? 0}%`
                  : update.state === 'ready'
                    ? `Update v${update.version ?? ''} ready to install`
                    : update.state === 'error'
                      ? (update.error ?? 'Update check failed')
                      : update.state === 'up-to-date'
                        ? 'You’re on the latest version'
                        : 'Check for a new version of MCSR Client'}
            </span>
          </div>
          {update.state === 'ready' ? (
            <button
              onClick={() => void window.mcsr.updater.install()}
              className="font-display shrink-0 rounded-lg bg-[var(--win)] px-4 py-2 text-sm text-[#07140a]"
            >
              Restart &amp; update
            </button>
          ) : (
            <button
              onClick={() => void window.mcsr.updater.check()}
              disabled={update.state === 'checking' || update.state === 'downloading'}
              className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
            >
              Check for updates
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-faint">You’re running MCSR Client v{__APP_VERSION__}.</p>
        {update.note && <p className="mt-2 text-xs text-faint">{update.note}</p>}
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
