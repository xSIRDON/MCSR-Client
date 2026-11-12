import { useEffect, useState } from 'react'
import { SAVED_KEY_MASK, type Account, type AppConfig, type JavaInfo, type TrackerStatus, type UpdateStatus } from '@shared/types'
import type { DataLocation, DataMoveProgress, DataMoveResult } from '@shared/ipc'
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
    void window.mcsr.paceman.getKey().then((k) => {
      if (k) setKeyInput(k)
    })
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
    const key = keyInput.trim()
    if (!key || key === SAVED_KEY_MASK) return
    await window.mcsr.paceman.setKey(key)
    setKeyInput(key)
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

      <Card title="Accounts">
        <div className="space-y-1.5">
          {accounts.length === 0 ? (
            <div className="text-sm text-muted">No accounts yet, add one to sign in.</div>
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
                    <span className="rounded-full bg-[var(--gold)]/15 px-2 py-0.5 text-[10px] tracking-wide text-[var(--gold)]">
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

      <Card title="Java runtime">
        <div className="flex items-center gap-2 text-sm">
          <Dot ok={!!java && (!!java.bundled || java.ok)} />
          <span className="text-muted">
            {java === null
              ? 'Checking…'
              : java.bundled
                ? 'Bundled Java 21, ready'
                : 'Bundled Java 21 downloads with your next launch'}
          </span>
        </div>
        {java && (
          <div className="mt-1 pl-4 text-xs text-faint">
            {java.found ? `System Java ${java.version} on PATH` : 'No system Java on PATH (not needed)'}
          </div>
        )}
        <p className="mt-2 text-xs text-faint">
          The game runs on Mojang’s own Java 21 with the ZGC garbage collector, the setup SeedQueue
          recommends, and the paceman tracker, Toolscreen and Ninjabrain Bot run on it too. A system
          Java 17+ is only a fallback for the tools until that download is done.
          {java && !java.bundled && !java.ok && (
            <>
              {' '}
              To use the tools before then, install{' '}
              <a
                href="https://adoptium.net/temurin/releases/?version=21"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--gold)] underline"
              >
                Temurin 21
              </a>
              .
            </>
          )}
        </p>
      </Card>

      <Card title="Game memory">
        <div className="text-sm text-muted">RAM is set per instance, under Edit instance.</div>
      </Card>

      <GameFiles />

      <Card title="Paceman">
        <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
          <label className="text-sm text-muted">Access key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={tracker.hasKey ? 'Saved. Paste a new one to replace it' : 'Paste your key'}
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 text-sm text-text outline-none focus:border-[var(--gold)]/40"
            />
            <button onClick={saveKey} className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-text">
              Save
            </button>
          </div>

          <label className="text-sm text-muted">Username</label>
          <div className="flex gap-2">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={profile?.name ?? 'username'}
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 text-sm text-text outline-none focus:border-[var(--gold)]/40"
            />
            <button
              onClick={() => {
                const v = nameInput.trim() || null
                patch({ pacemanName: v })
                setPacemanName(v)
                flash(v ? 'Paceman connected' : 'Paceman disconnected')
              }}
              className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-text"
            >
              Save
            </button>
          </div>

          <span className="text-sm text-muted">Tracker</span>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Dot ok={tracker.running} />
              {tracker.running ? 'Running' : 'Starts with RSG'}
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={config?.pacemanShowWindow ?? true}
                onChange={(e) => patch({ pacemanShowWindow: e.target.checked })}
              />
              Show its window
            </label>
          </div>
        </div>
        <p className="mt-3 text-xs text-faint">
          Get a key at paceman.gg: sign in with Discord, then Generate Access Token.
        </p>
      </Card>

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

function GameFiles() {
  const [location, setLocation] = useState<DataLocation | null>(null)
  const [progress, setProgress] = useState<DataMoveProgress | null>(null)
  const [moving, setMoving] = useState(false)
  const [done, setDone] = useState<DataMoveResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.mcsr.data.location().then(setLocation)
    return window.mcsr.data.onMoveProgress(setProgress)
  }, [])

  async function move(toDefault: boolean) {
    setError(null)
    setProgress(null)
    setMoving(true)
    try {
      const result = await window.mcsr.data.move(toDefault)
      if (result) setDone(result)
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setMoving(false)
    }
  }

  const pct = progress && progress.totalBytes > 0 ? Math.floor((progress.doneBytes / progress.totalBytes) * 100) : null

  return (
    <Card title="Game files">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm text-muted">
          Instances, worlds and downloads are kept in{' '}
          <span className="break-all text-text">{done?.path ?? location?.path ?? '…'}</span>
        </div>
        <button
          onClick={() => void move(false)}
          disabled={moving || !!done}
          className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
        >
          Move…
        </button>
      </div>
      {moving && (
        <p className="mt-2 text-xs text-faint">
          {progress?.stage === 'copying'
            ? `Copying… ${pct ?? 0}% (${progress.doneFiles.toLocaleString()} of ${progress.totalFiles.toLocaleString()} files)`
            : progress?.stage === 'cleaning'
              ? 'Removing the old copy…'
              : progress?.stage === 'scanning'
                ? `Counting files… ${progress.totalFiles.toLocaleString()}`
                : 'Moving…'}
        </p>
      )}
      {done && (
        <p className="mt-2 text-xs text-[var(--win)]">
          Moved. Restarting MCSR Client…
          {done.leftover && <span className="text-faint"> The old folder couldn’t be fully removed: {done.leftover}</span>}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-[var(--loss)]">{error}</p>}
      {location && !location.isDefault && !moving && !done && (
        <button onClick={() => void move(true)} className="mt-2 text-xs text-faint hover:text-text">
          Move back to the default folder
        </button>
      )}
      <p className="mt-2 text-xs text-faint">
        Close Minecraft first. Moving to another drive copies everything, which can take a while if you have a lot of worlds.
      </p>
    </Card>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5">
      <h2 className="mb-3 text-sm font-semibold text-text">{title}</h2>
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
