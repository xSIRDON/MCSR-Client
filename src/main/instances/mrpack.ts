// Downloads, parses, verifies, and installs a Modrinth .mrpack into an instance.
// The same code builds both instances: Ranked installs every file; RSG passes
// excludePrefixes to drop the ranked-only jars.

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import extract from 'extract-zip'

export const MCSR_MRPACK_URL =
  'https://redlime.github.io/MCSRMods/modpacks/v4/MCSRRanked-Windows-1.16.1-All.mrpack'

/** Mod id/filename prefixes that are ranked-only and must be excluded from RSG. */
export const RSG_EXCLUDE_PREFIXES = ['mcsrranked', 'mcsrfairplay']

export interface PackFile {
  path: string
  hashes: { sha1?: string; sha512?: string }
  env?: { client?: string; server?: string }
  downloads: string[]
  fileSize?: number
}

export interface ModrinthIndex {
  formatVersion: number
  game: string
  versionId: string
  name: string
  summary?: string
  files: PackFile[]
  dependencies: Record<string, string>
}

// ---- Pure helpers (unit-tested) ----

export function parseIndex(json: unknown): ModrinthIndex {
  const idx = json as ModrinthIndex
  if (!idx || idx.game !== 'minecraft' || !Array.isArray(idx.files)) {
    throw new Error('Not a valid modrinth.index.json')
  }
  return idx
}

/** Drop files whose basename starts with any excluded prefix. */
export function filterMods(files: PackFile[], excludePrefixes: string[]): PackFile[] {
  if (excludePrefixes.length === 0) return files
  return files.filter((f) => {
    const base = f.path.split('/').pop() ?? f.path
    return !excludePrefixes.some((p) => base.toLowerCase().startsWith(p.toLowerCase()))
  })
}

/** Verify a downloaded buffer against the pack hashes (sha512 preferred). */
export function verifyBuffer(buf: Buffer, hashes: PackFile['hashes']): void {
  if (hashes.sha512) {
    const got = createHash('sha512').update(buf).digest('hex')
    if (got !== hashes.sha512) throw new Error('sha512 mismatch')
    return
  }
  if (hashes.sha1) {
    const got = createHash('sha1').update(buf).digest('hex')
    if (got !== hashes.sha1) throw new Error('sha1 mismatch')
    return
  }
  // No hash to check against — accept.
}

export function fabricVersionString(index: ModrinthIndex): string {
  const loader = index.dependencies['fabric-loader']
  const mc = index.dependencies['minecraft']
  if (!loader || !mc) throw new Error('Pack missing fabric-loader/minecraft dependency')
  return `fabric-loader-${loader}-${mc}`
}

// ---- Network/fs orchestration ----

type FetchBuffer = (url: string) => Promise<Buffer>

const nodeFetchBuffer: FetchBuffer = async (url) => {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Download + unzip the .mrpack and return its parsed index. */
export async function fetchPack(
  url = MCSR_MRPACK_URL,
  fetchBuffer: FetchBuffer = nodeFetchBuffer
): Promise<ModrinthIndex> {
  const buf = await fetchBuffer(url)
  const work = join(tmpdir(), `obsidian-mrpack-${Date.now()}`)
  const zipPath = join(work, 'pack.mrpack')
  mkdirSync(work, { recursive: true })
  writeFileSync(zipPath, buf)
  try {
    await extract(zipPath, { dir: work })
    const indexPath = join(work, 'modrinth.index.json')
    const index = parseIndex(JSON.parse(readFileSync(indexPath, 'utf8')))
    return index
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export interface InstallOpts {
  excludePrefixes?: string[]
  /** Absolute path to a SeedQueue jar to substitute for the pack's. */
  seedQueueOverride?: string | null
  onProgress?: (done: number, total: number, label: string) => void
  fetchBuffer?: FetchBuffer
}

/** Download every (filtered) pack file into the game directory, verifying hashes. */
export async function installPackFiles(
  index: ModrinthIndex,
  gameDir: string,
  opts: InstallOpts = {}
): Promise<void> {
  const fetchBuffer = opts.fetchBuffer ?? nodeFetchBuffer
  let files = filterMods(index.files, opts.excludePrefixes ?? [])

  // If overriding SeedQueue, drop the pack's seedqueue jar; we copy the user's after.
  if (opts.seedQueueOverride) {
    files = files.filter((f) => !(f.path.split('/').pop() ?? '').toLowerCase().startsWith('seedqueue'))
  }

  const total = files.length
  let done = 0
  for (const file of files) {
    opts.onProgress?.(done, total, file.path.split('/').pop() ?? file.path)
    const dest = join(gameDir, file.path)
    mkdirSync(dirname(dest), { recursive: true })

    let lastErr: unknown
    let ok = false
    for (const url of file.downloads) {
      try {
        const buf = await fetchBuffer(url)
        verifyBuffer(buf, file.hashes)
        writeFileSync(dest, buf)
        ok = true
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (!ok) throw new Error(`Failed to install ${file.path}: ${String(lastErr)}`)
    done++
  }

  if (opts.seedQueueOverride && existsSync(opts.seedQueueOverride)) {
    const base = opts.seedQueueOverride.split(/[\\/]/).pop() ?? 'seedqueue-override.jar'
    cpSync(opts.seedQueueOverride, join(gameDir, 'mods', base))
  }

  opts.onProgress?.(total, total, 'done')
}
