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

  useEffect(() => {
    if (!id) return
    void window.mcsr.config.get().then((c) => {
      setConfig(c)
      setSel(new Set(c.maps[id]))
    })
  }, [id])

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

  async function install() {
    if (!id) return
    if (config) await window.mcsr.config.set({ maps: { ...config.maps, [id]: [...sel] } })
    await proceed(id, { importFrom: importFrom || null })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 animate-fade-up" onClick={cancel}>
      <div className="surface w-full max-w-[460px] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg tracking-wide text-text">Install {TITLES[id]}</h2>
        <p className="mt-1 text-sm text-muted">
          Choose which practice maps to download now. You can change these any time in Edit Instance.
        </p>

        {sources.length > 0 && (
          <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--bg-2)]/50 p-3">
            <label className="block text-sm text-text">Import settings from another instance</label>
            <p className="mt-1 text-xs text-faint">
              Copy your <code>options.txt</code>, <code>hotbar.nbt</code>, and entire{' '}
              <code>config/</code> folder (keybinds, sensitivity, and your StandardSettings / world
              options) from an instance you’ve already set up. World saves aren’t touched.
            </p>
            <select
              value={importFrom}
              onChange={(e) => setImportFrom(e.target.value as InstanceId | '')}
              className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-sm text-text outline-none focus:border-[var(--gold)]/40"
            >
              <option value="">Don’t import — fresh install</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  From {TITLES[s]}
                </option>
              ))}
            </select>
          </div>
        )}

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

        <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
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
