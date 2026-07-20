import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { AppConfig, InstanceId, ModInfo } from '@shared/types'
import { MAP_CATALOG, ALL_MAP_IDS } from '@shared/maps'

const TITLES: Record<InstanceId, string> = { ranked: 'Ranked', rsg: 'RSG', zsg: 'ZSG' }

/** Per-instance management: memory, Java, files, and mods. */
export function Instance() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const instanceId: InstanceId | null =
    id === 'ranked' || id === 'rsg' || id === 'zsg' ? id : null

  if (!instanceId) {
    return <div className="mx-auto max-w-[760px] px-5 py-6 text-muted">Unknown instance.</div>
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-4 px-5 py-5">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate('/play')}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-muted hover:text-text"
          title="Back to Play"
        >
          ←
        </button>
        <h1 className="font-display text-xl tracking-wide text-text">
          {TITLES[instanceId]} <span className="text-muted">· Edit instance</span>
        </h1>
      </header>

      <MemoryCard id={instanceId} />
      <JavaCard id={instanceId} />
      <FilesCard id={instanceId} />
      <SettingsImportCard id={instanceId} />
      <MapsCard id={instanceId} />
      <ModsCard id={instanceId} />
      <DangerCard id={instanceId} onDeleted={() => navigate('/play')} />
    </div>
  )
}

function DangerCard({ id, onDeleted }: { id: InstanceId; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function del() {
    setBusy(true)
    setError(null)
    try {
      await window.mcsr.instances.delete(id)
      onDeleted()
    } catch (e) {
      setBusy(false)
      setConfirm(false)
      setError(e instanceof Error ? e.message : 'Could not delete the instance.')
    }
  }

  return (
    <section className="surface p-5">
      <h2 className="mb-3 font-display text-sm uppercase tracking-[0.16em] text-[var(--loss)]">Danger zone</h2>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted">
          Delete this instance — removes its mods, saves, configs and downloaded files.{' '}
          <span className="text-faint">Shared game files (assets/libraries) are kept.</span>
        </div>
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            className="shrink-0 rounded-lg border border-[var(--loss)]/40 px-3 py-1.5 text-sm text-[var(--loss)] transition-colors hover:bg-[var(--loss)]/10"
          >
            Delete…
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setConfirm(false)}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={del}
              disabled={busy}
              className="rounded-lg bg-[var(--loss)] px-3 py-1.5 text-sm text-[#0a0a10] disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        )}
      </div>
      {error && <div className="mt-2 text-xs text-[var(--loss)]">{error}</div>}
    </section>
  )
}

function MemoryCard({ id }: { id: InstanceId }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  useEffect(() => {
    void window.mcsr.config.get().then(setConfig)
  }, [])
  if (!config) return null

  const mb = config.ram[id]
  const setLocal = (v: number) => setConfig({ ...config, ram: { ...config.ram, [id]: v } })
  const commit = (v: number) =>
    void window.mcsr.config.set({ ram: { ...config.ram, [id]: v } }).then(setConfig)

  return (
    <Card title="Memory">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-muted">Allocated RAM</span>
        <span className="font-display text-text">{(mb / 1024).toFixed(1)} GB</span>
      </div>
      <input
        type="range"
        min={2048}
        max={12288}
        step={512}
        value={mb}
        onChange={(e) => setLocal(Number(e.target.value))}
        onMouseUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        className="w-full accent-[var(--gold)]"
      />
      <div className="mt-1 text-xs text-faint">
        3–4 GB is plenty for 1.16.1 + SeedQueue. Applies to this instance only.
      </div>
    </Card>
  )
}

function JavaCard({ id }: { id: InstanceId }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  useEffect(() => {
    void window.mcsr.config.get().then(setConfig)
  }, [])
  if (!config) return null

  const java = config.java[id]
  const set = (value: string | null) =>
    void window.mcsr.config.set({ java: { ...config.java, [id]: value } }).then(setConfig)

  async function browse() {
    const p = await window.mcsr.config.pickJava()
    if (p) set(p)
  }

  return (
    <Card title="Java">
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            checked={java === null}
            onChange={() => set(null)}
            className="accent-[var(--gold)]"
          />
          <span className={java === null ? 'text-text' : 'text-muted'}>Automatic</span>
          <span className="text-xs text-faint">— bundled Java 8, recommended for 1.16.1</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            checked={java !== null}
            onChange={browse}
            className="accent-[var(--gold)]"
          />
          <span className={java !== null ? 'text-text' : 'text-muted'}>Custom java executable</span>
        </label>
        {java !== null && (
          <div className="flex items-center gap-2 pl-6">
            <code className="min-w-0 flex-1 truncate rounded border border-[var(--line)] bg-[var(--bg-2)] px-2 py-1 text-xs text-text">
              {java}
            </code>
            <button
              onClick={browse}
              className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1 text-sm text-muted hover:text-text"
            >
              Browse…
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-faint">
        Pick a custom Java (e.g. your own Java 17) only if you know the args you need — the game
        targets Java 8 by default.
      </p>
    </Card>
  )
}

function FilesCard({ id }: { id: InstanceId }) {
  return (
    <Card title="Files">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted">
          Open this instance’s game folder — <span className="text-faint">mods, saves, config, logs</span>.
        </div>
        <button
          onClick={() => void window.mcsr.instances.openFolder(id)}
          className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted hover:text-text"
        >
          Open folder
        </button>
      </div>
    </Card>
  )
}

function ModsCard({ id }: { id: InstanceId }) {
  const [mods, setMods] = useState<ModInfo[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void window.mcsr.instances.mods(id).then(setMods)
  }, [id])

  const toggle = (file: string, enabled: boolean) =>
    void window.mcsr.instances.toggleMod(id, file, enabled).then(setMods)

  const extraOptionsInstalled = !!mods?.some((m) => m.name.toLowerCase() === 'extra-options')
  const canAddExtraOptions = (id === 'rsg' || id === 'zsg') && mods !== null && !extraOptionsInstalled

  async function addExtraOptions() {
    setAdding(true)
    setError(null)
    try {
      await window.mcsr.instances.addExtraOptions([id])
      setMods(await window.mcsr.instances.mods(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add extra-options.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card title={`Mods${mods ? ` · ${mods.length}` : ''}`}>
      {canAddExtraOptions && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-[var(--gold)]/30 bg-[var(--gold)]/[0.06] px-3 py-2">
          <div className="min-w-0 text-sm text-muted">
            <span className="text-text">extra-options</span> — a legal MCSR mod, not installed on
            this instance.
          </div>
          <button
            onClick={addExtraOptions}
            disabled={adding}
            className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add extra-options'}
          </button>
        </div>
      )}
      {error && <div className="mb-2 text-xs text-[var(--loss)]">{error}</div>}
      {!mods ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : mods.length === 0 ? (
        <div className="text-sm text-muted">No mods yet — install or launch this instance first.</div>
      ) : (
        <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {mods.map((m) => (
            <div
              key={m.file}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-1.5"
              style={{ opacity: m.enabled ? 1 : 0.55 }}
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-text">{m.name}</div>
                {m.version && <div className="text-xs text-faint">{m.version}</div>}
              </div>
              <Toggle on={m.enabled} onChange={(v) => toggle(m.file, v)} />
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-faint">
        Disabling a mod parks it as <code>.disabled</code>. Note: removing pack mods can make a run
        illegal or break Ranked.
      </p>
    </Card>
  )
}

function SettingsImportCard({ id }: { id: InstanceId }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [sources, setSources] = useState<InstanceId[]>([])
  const [source, setSource] = useState<InstanceId | ''>('')

  useEffect(() => {
    void window.mcsr.instances.installedIds().then((ids) => {
      const others = ids.filter((i) => i !== id)
      setSources(others)
      setSource(others[0] ?? '')
    })
  }, [id])

  async function importFromInstance() {
    if (!source) return
    setBusy(true)
    setResult(null)
    try {
      const { copied } = await window.mcsr.instances.importFromInstance(id, source)
      setResult(
        copied.length > 0
          ? { ok: true, msg: `Imported ${copied.join(', ')} from ${TITLES[source]}.` }
          : { ok: false, msg: `Nothing to import from ${TITLES[source]} yet.` }
      )
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Could not import from that instance.' })
    } finally {
      setBusy(false)
    }
  }

  async function importFolder() {
    const folder = await window.mcsr.config.pickFolder()
    if (!folder) return
    setBusy(true)
    setResult(null)
    try {
      const { copied } = await window.mcsr.instances.importFromFolderPath(id, folder)
      setResult(
        copied.length > 0
          ? { ok: true, msg: `Imported ${copied.join(', ')} from the chosen folder.` }
          : { ok: false, msg: 'No options.txt / hotbar.nbt / config / resourcepacks found in that folder.' }
      )
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Could not import from that folder.' })
    } finally {
      setBusy(false)
    }
  }

  async function importFile() {
    setBusy(true)
    setResult(null)
    try {
      const res = await window.mcsr.instances.importSettings(id)
      if (res)
        setResult(
          res.imported > 0
            ? { ok: true, msg: `Imported ${res.imported} setting${res.imported === 1 ? '' : 's'} from options.txt.` }
            : { ok: false, msg: 'No settings found in that file.' }
        )
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Could not import that file.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Import settings">
      {/* From another instance */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm text-muted">
          Copy <code>options.txt</code>, <code>hotbar.nbt</code>, <code>config/</code>, and your{' '}
          <code>resourcepacks/</code> (keybinds, sensitivity, StandardSettings, world options, and
          your seedwall) from another instance.
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as InstanceId | '')}
            disabled={busy || sources.length === 0}
            className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-2 py-1.5 text-sm text-text outline-none focus:border-[var(--gold)]/40 disabled:opacity-50"
          >
            {sources.length === 0 ? (
              <option value="">No other instances</option>
            ) : (
              sources.map((s) => (
                <option key={s} value={s}>
                  {TITLES[s]}
                </option>
              ))
            )}
          </select>
          <button
            onClick={importFromInstance}
            disabled={busy || !source}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>

      {/* From any folder */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
        <div className="min-w-0 text-sm text-muted">
          …or import from <span className="text-text">any folder</span> — another launcher’s instance,
          an old <code>.minecraft</code>, anywhere. We find the settings inside it.
        </div>
        <button
          onClick={importFolder}
          disabled={busy}
          className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          Choose folder…
        </button>
      </div>

      {/* From an external options.txt */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
        <div className="min-w-0 text-sm text-muted">
          …or pull just keybinds/sensitivity/video from an external <code>options.txt</code>.
        </div>
        <button
          onClick={importFile}
          disabled={busy}
          className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Browse to options.txt…'}
        </button>
      </div>

      {result && (
        <div className={`mt-2 text-xs ${result.ok ? 'text-[var(--win)]' : 'text-[var(--loss)]'}`}>
          {result.msg}
        </div>
      )}
      <p className="mt-2 text-xs text-faint">
        Importing from an instance overwrites this instance’s matching files; your world saves aren’t
        touched.
      </p>
    </Card>
  )
}

function MapsCard({ id }: { id: InstanceId }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [syncing, setSyncing] = useState(false)
  useEffect(() => {
    void window.mcsr.config.get().then(setConfig)
  }, [])
  if (!config) return null

  const selected = new Set(config.maps[id])

  async function setSelection(next: string[]) {
    // Flip syncing first so the toggles disable before a second click can race on a
    // stale `config` closure; the main process also serializes the syncMaps itself.
    setSyncing(true)
    try {
      const updated = await window.mcsr.config.set({ maps: { ...config!.maps, [id]: next } })
      setConfig(updated)
      await window.mcsr.instances.syncMaps(id)
    } finally {
      setSyncing(false)
    }
  }

  const toggle = (mapId: string, on: boolean) =>
    setSelection(on ? [...config!.maps[id], mapId] : config!.maps[id].filter((m) => m !== mapId))

  const allOn = selected.size === MAP_CATALOG.length

  return (
    <Card title={`Practice maps${syncing ? ' · syncing…' : ` · ${selected.size}/${MAP_CATALOG.length}`}`}>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setSelection([...ALL_MAP_IDS])}
          disabled={syncing || allOn}
          className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          Install all
        </button>
        <button
          onClick={() => setSelection([])}
          disabled={syncing || selected.size === 0}
          className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <div className="space-y-1.5">
        {MAP_CATALOG.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text">{m.name}</span>
                <span className="rounded-full border border-[var(--line)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-faint">
                  {m.category}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-faint">{m.desc}</div>
            </div>
            <Toggle on={selected.has(m.id)} onChange={(v) => toggle(m.id, v)} disabled={syncing} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">
        Selected maps install into this instance’s <code>saves/</code> (now, and on next launch).
        Turning one off removes that world.
      </p>
    </Card>
  )
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? 'bg-[var(--gold)]' : 'border border-[var(--line)] bg-[var(--surface-2)]'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
        style={{ left: on ? '18px' : '2px', background: on ? '#0a0a10' : 'var(--faint)' }}
      />
    </button>
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
