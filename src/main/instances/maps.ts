// Installs/removes practice maps in an instance's saves/ folder to match a
// per-instance selection. A manifest records which world folder(s) each map id
// created, so a map can be cleanly removed later.

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  cpSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import extract from 'extract-zip'
import { MAP_CATALOG, type MapDef } from '../../shared/maps'

const MANIFEST = '.mcsrclient-maps.json'
/** mapId -> the world folder name(s) that map placed in saves/. */
type Manifest = Record<string, string[]>

export function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'world'
}

/** Place the extracted world folder(s) into saves/, returning the folder names created. */
export function placeWorlds(extractDir: string, savesDir: string, fallbackName: string): string[] {
  const entries = readdirSync(extractDir)
  const roots = entries.includes('level.dat')
    ? [{ src: extractDir, name: fallbackName }]
    : entries
        .filter((e) => {
          try {
            return statSync(join(extractDir, e)).isDirectory()
          } catch {
            return false
          }
        })
        .map((e) => ({ src: join(extractDir, e), name: e }))

  const placed: string[] = []
  for (const { src, name } of roots) {
    let base = sanitize(name)
    let n = 2
    while (existsSync(join(savesDir, base))) base = `${sanitize(name)} (${n++})`
    cpSync(src, join(savesDir, base), { recursive: true })
    placed.push(base)
  }
  return placed
}

function readManifest(savesDir: string): Manifest {
  try {
    const f = join(savesDir, MANIFEST)
    if (existsSync(f)) {
      const parsed = JSON.parse(readFileSync(f, 'utf8'))
      // Old install-all sentinel { maps: [names] } — treat every catalog map as
      // present-but-untracked so we don't re-download duplicates.
      if (parsed && Array.isArray(parsed.maps)) {
        const m: Manifest = {}
        for (const def of MAP_CATALOG) m[def.id] = []
        return m
      }
      if (parsed && typeof parsed === 'object') return parsed as Manifest
    }
  } catch {
    /* fall through */
  }
  return {}
}

function writeManifest(savesDir: string, m: Manifest): void {
  writeFileSync(join(savesDir, MANIFEST), JSON.stringify(m, null, 2), 'utf8')
}

async function installMap(savesDir: string, map: MapDef): Promise<string[]> {
  const res = await fetch(map.url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`map "${map.name}" download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())

  const base = join(tmpdir(), `mcsrmap-${process.pid}-${map.id}`)
  const zip = `${base}.zip`
  const out = `${base}-x`
  mkdirSync(out, { recursive: true })
  writeFileSync(zip, buf)
  try {
    await extract(zip, { dir: out })
    return placeWorlds(out, savesDir, map.name)
  } finally {
    rmSync(zip, { force: true })
    rmSync(out, { recursive: true, force: true })
  }
}

/**
 * Make the maps in `savesDir` match `selectedIds`: install selected maps that
 * aren't present, and remove the world folders of maps that were deselected.
 * Best effort — a failed download is skipped.
 */
export async function syncMaps(
  savesDir: string,
  selectedIds: string[],
  onProgress?: (done: number, total: number, label: string) => void
): Promise<void> {
  mkdirSync(savesDir, { recursive: true })
  const manifest = readManifest(savesDir)
  const selected = new Set(selectedIds)

  // Remove deselected maps' worlds.
  for (const mapId of Object.keys(manifest)) {
    if (!selected.has(mapId)) {
      for (const folder of manifest[mapId]) {
        try {
          rmSync(join(savesDir, folder), { recursive: true, force: true })
        } catch {
          /* best effort */
        }
      }
      delete manifest[mapId]
    }
  }

  // Install newly selected maps.
  const toInstall = MAP_CATALOG.filter((m) => selected.has(m.id) && !(m.id in manifest))
  for (let i = 0; i < toInstall.length; i++) {
    onProgress?.(i, toInstall.length, toInstall[i].name)
    try {
      manifest[toInstall[i].id] = await installMap(savesDir, toInstall[i])
    } catch {
      /* skip a failed map, keep going */
    }
  }

  writeManifest(savesDir, manifest)
  onProgress?.(toInstall.length, toInstall.length, 'done')
}
