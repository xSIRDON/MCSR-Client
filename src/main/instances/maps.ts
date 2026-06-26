// Installs the default practice maps into an instance's saves/ folder. Each map
// is a zipped world; we download it, extract to a temp dir, and place the world
// folder(s) into saves/. Idempotent via a sentinel file so it runs once.

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
  cpSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import extract from 'extract-zip'

interface MapDef {
  name: string
  url: string
}

const DEFAULT_MAPS: MapDef[] = [
  {
    name: 'Portal Practice v2.8',
    url: 'https://github.com/Semperzz/Portal-Practice/releases/download/v2.8/Portal.Practice.v2.zip'
  },
  {
    name: 'Zero Practice v1.2.2',
    url: 'https://github.com/Mescht/Zero-Practice/releases/download/v1.2.2/Zero.Practice.v1.2.2.zip'
  },
  {
    name: 'MCSR Practice v2.0.0',
    url: 'https://github.com/Dibedy/The-MCSR-Practice-Map/releases/download/latest/MCSR.Practice.v2.0.0.zip'
  },
  {
    name: 'Crafting Practice v2.1',
    url: 'https://github.com/Semperzz/Crafting-Practice-v2/releases/download/v2.1/Crafting.Practice.v2.zip'
  },
  {
    name: 'Llama Bastion Practice 3.15.0',
    url: 'https://github.com/LlamaPag/bastion/releases/download/3.15.0/LBP.3.15.0.zip'
  }
]

const SENTINEL = '.mcsrclient-maps.json'

export function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'world'
}

/** Place the extracted world folder(s) from `extractDir` into `savesDir`. */
export function placeWorlds(extractDir: string, savesDir: string, fallbackName: string): void {
  const entries = readdirSync(extractDir)
  const roots = entries.includes('level.dat')
    ? [{ src: extractDir, name: fallbackName }] // the zip root is itself a world
    : entries
        .filter((e) => {
          try {
            return statSync(join(extractDir, e)).isDirectory()
          } catch {
            return false
          }
        })
        .map((e) => ({ src: join(extractDir, e), name: e }))

  for (const { src, name } of roots) {
    let dest = join(savesDir, sanitize(name))
    let n = 2
    while (existsSync(dest)) dest = join(savesDir, `${sanitize(name)} (${n++})`)
    cpSync(src, dest, { recursive: true })
  }
}

async function installOneMap(savesDir: string, map: MapDef, seq: number): Promise<void> {
  const res = await fetch(map.url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`map "${map.name}" download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())

  const base = join(tmpdir(), `mcsrmap-${process.pid}-${seq}`)
  const zip = `${base}.zip`
  const out = `${base}-x`
  mkdirSync(out, { recursive: true })
  writeFileSync(zip, buf)
  try {
    await extract(zip, { dir: out })
    placeWorlds(out, savesDir, map.name)
  } finally {
    rmSync(zip, { force: true })
    rmSync(out, { recursive: true, force: true })
  }
}

/**
 * Download + install the default practice maps into `savesDir`, once. A failed
 * map is skipped (best effort) so one bad download doesn't block the rest.
 */
export async function installDefaultMaps(
  savesDir: string,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<void> {
  mkdirSync(savesDir, { recursive: true })
  if (existsSync(join(savesDir, SENTINEL))) return // already installed

  const total = DEFAULT_MAPS.length
  for (let i = 0; i < total; i++) {
    onProgress?.(i, total, DEFAULT_MAPS[i].name)
    try {
      await installOneMap(savesDir, DEFAULT_MAPS[i], i)
    } catch {
      // best effort — skip this map, keep going
    }
  }
  writeFileSync(join(savesDir, SENTINEL), JSON.stringify({ maps: DEFAULT_MAPS.map((m) => m.name) }, null, 2))
  onProgress?.(total, total, 'done')
}
