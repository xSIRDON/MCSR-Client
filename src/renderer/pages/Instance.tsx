import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { AppConfig, InstanceId, ModInfo } from '@shared/types'

const TITLES: Record<InstanceId, string> = { ranked: 'Ranked', rsg: 'RSG' }

/** Per-instance management: memory, Java, files, and mods. */
export function Instance() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const instanceId: InstanceId | null = id === 'ranked' || id === 'rsg' ? id : null

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
      <ModsCard id={instanceId} />
    </div>
  )
}

function MemoryCard({ id }: { id: InstanceId }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  useEffect(() => {
    void window.obsidian.config.get().then(setConfig)
  }, [])
  if (!config) return null

  const mb = config.ram[id]
  const setLocal = (v: number) => setConfig({ ...config, ram: { ...config.ram, [id]: v } })
  const commit = (v: number) =>
    void window.obsidian.config.set({ ram: { ...config.ram, [id]: v } }).then(setConfig)

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
    void window.obsidian.config.get().then(setConfig)
  }, [])
  if (!config) return null

  const java = config.java[id]
  const set = (value: string | null) =>
    void window.obsidian.config.set({ java: { ...config.java, [id]: value } }).then(setConfig)

  async function browse() {
    const p = await window.obsidian.config.pickJava()
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
          onClick={() => void window.obsidian.instances.openFolder(id)}
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
  useEffect(() => {
    void window.obsidian.instances.mods(id).then(setMods)
  }, [id])

  const toggle = (file: string, enabled: boolean) =>
    void window.obsidian.instances.toggleMod(id, file, enabled).then(setMods)

  return (
    <Card title={`Mods${mods ? ` · ${mods.length}` : ''}`}>
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

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? 'bg-[var(--gold)]' : 'border border-[var(--line)] bg-[var(--surface-2)]'
      }`}
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
