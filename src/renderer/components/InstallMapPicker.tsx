import { useEffect, useState } from 'react'
import type { AppConfig, InstanceId } from '@shared/types'
import { MAP_CATALOG, ALL_MAP_IDS } from '@shared/maps'
import { useInstances } from '../hooks/useInstances'

const TITLES: Record<InstanceId, string> = { ranked: 'Ranked', rsg: 'RSG', zsg: 'ZSG' }

/** Shown before a first-time install so the player picks which practice maps to download. */
export function InstallMapPicker() {
  const id = useInstances((s) => s.installPrompt)
  const cancel = useInstances((s) => s.cancelInstall)
  const proceed = useInstances((s) => s.proceedLaunch)
  const statuses = useInstances((s) => s.statuses)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set(ALL_MAP_IDS))
  const [importFrom, setImportFrom] = useState<InstanceId | ''>('')
  const [importFolder, setImportFolder] = useState<string | null>(null)
  const [worlds, setWorlds] = useState<string[]>([])
  const [pickedWorlds, setPickedWorlds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return
    void window.mcsr.config.get().then((c) => {
      setConfig(c)
      setSel(new Set(c.maps[id]))
    })
  }, [id])

  // Fetch the worlds in the chosen import source so the player can pick which ones to copy.
  useEffect(() => {
    setPickedWorlds(new Set())
    let active = true
    const src = importFolder
      ? window.mcsr.instances.listWorldsInFolder(importFolder)
      : importFrom
        ? window.mcsr.instances.listWorlds(importFrom)
        : Promise.resolve<string[]>([])
    void src.then((w) => {
      if (active) setWorlds(w)
    })
    return () => {
      active = false
    }
  }, [importFrom, importFolder])

  if (!id) return null

  const sources = (['ranked', 'rsg', 'zsg'] as InstanceId[]).filter(
    (i) => i !== id && ['ready', 'running', 'launching'].includes(statuses[i].state)
  )

  const toggle = (mapId: string) =>
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(mapId)) next.delete(mapId)
      else next.add(mapId)
      return next
    })

  async function chooseFolder() {
    const f = await window.mcsr.config.pickFolder()
    if (f) {
      setImportFolder(f)
      setImportFrom('')
    }
  }

  const toggleWorld = (w: string) =>
    setPickedWorlds((prev) => {
      const next = new Set(prev)
      if (next.has(w)) next.delete(w)
      else next.add(w)
      return next
    })

  async function install() {
    if (!id) return
    if (config) await window.mcsr.config.set({ maps: { ...config.maps, [id]: [...sel] } })
    await proceed(id, {
      importFrom: importFolder ? null : importFrom || null,
      importFolder,
      importWorlds: [...pickedWorlds]
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 animate-fade-up" onClick={cancel}>
      <div
        className="surface flex max-h-[90vh] w-full max-w-[520px] flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg tracking-wide text-text">Install {TITLES[id]}</h2>

        <div className="-mr-2 mt-2 min-h-0 flex-1 overflow-y-auto pr-2">
        <p className="text-sm text-muted">
          Choose which practice maps to download now. You can change these any time in Edit Instance.
        </p>

        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--bg-2)]/50 p-3">
          <label className="block text-sm text-text">Import settings (optional)</label>
          <p className="mt-1 text-xs text-faint">
            Copy <code>options.txt</code>, <code>hotbar.nbt</code>, <code>config/</code>, and your{' '}
            <code>resourcepacks/</code> (your seedwall) from another instance — or any folder (another{' '}
            launcher’s instance, an old <code>.minecraft</code>) — and pick which of its worlds to
            bring along.
          </p>
          {importFolder ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--gold)]/40 bg-[var(--bg-2)] px-3 py-2">
              <span className="min-w-0 truncate text-xs text-text" title={importFolder}>
                {importFolder}
              </span>
              <button
                onClick={() => setImportFolder(null)}
                className="shrink-0 text-xs text-faint transition-colors hover:text-[var(--loss)]"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              {sources.length > 0 && (
                <select
                  value={importFrom}
                  onChange={(e) => setImportFrom(e.target.value as InstanceId | '')}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-sm text-text outline-none focus:border-[var(--gold)]/40"
                >
                  <option value="">Don’t import — fresh install</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      From {TITLES[s]}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={chooseFolder}
                className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-muted transition-colors hover:text-text"
              >
                Choose folder…
              </button>
            </div>
          )}

          {(importFrom || importFolder) && worlds.length > 0 && (
            <div className="mt-3 border-t border-[var(--line)] pt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-muted">
                  Worlds to copy ({pickedWorlds.size}/{worlds.length})
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPickedWorlds(new Set(worlds))}
                    className="text-[11px] text-faint transition-colors hover:text-text"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setPickedWorlds(new Set())}
                    className="text-[11px] text-faint transition-colors hover:text-text"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="space-y-0.5 rounded-md border border-[var(--line)] bg-[var(--bg-2)] p-1.5">
                {worlds.map((w) => (
                  <label
                    key={w}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-text transition-colors hover:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      checked={pickedWorlds.has(w)}
                      onChange={() => toggleWorld(w)}
                      className="h-3.5 w-3.5 shrink-0 accent-[var(--gold)]"
                    />
                    <span className="truncate">{w}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mb-1 mt-3 text-xs uppercase tracking-wider text-faint">Practice maps</div>
        <div className="mb-2 flex gap-2">
          <button
            onClick={() => setSel(new Set(ALL_MAP_IDS))}
            className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            Select all
          </button>
          <button
            onClick={() => setSel(new Set())}
            className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            None
          </button>
        </div>

        <div className="space-y-1.5">
          {MAP_CATALOG.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2 transition-colors hover:bg-white/[0.03]"
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
              <input
                type="checkbox"
                checked={sel.has(m.id)}
                onChange={() => toggle(m.id)}
                className="h-4 w-4 shrink-0 accent-[var(--gold)]"
              />
            </label>
          ))}
        </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={cancel}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={install}
            className="font-display rounded-lg px-5 py-2 text-sm tracking-wide text-[#07140a]"
            style={{
              background: 'linear-gradient(180deg,#6fcf57,#4ea73e)',
              boxShadow: '0 8px 24px rgba(94,167,62,.4), inset 0 1px 0 rgba(255,255,255,.25)'
            }}
          >
            Install &amp; Play{sel.size > 0 ? ` · ${sel.size} map${sel.size === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
