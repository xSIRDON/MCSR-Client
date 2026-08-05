// Downloads, parses, verifies, and installs a Modrinth .mrpack into an instance.
// The same code builds both instances: Ranked installs every file; RSG passes
// excludePrefixes to drop the ranked-only jars.

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, cpSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import extract from 'extract-zip'

// Upstream consolidated the per-variant packs into this one all-inclusive pack (it still
// bundles mcsrranked + mcsrfairplay + seedqueue); the old "-All" URL now 404s. Ranked installs
// every file, RSG drops the ranked-only jars via RSG_EXCLUDE_PREFIXES.
export const MCSR_MRPACK_URL =
  'https://redlime.github.io/MCSRMods/modpacks/v4/MCSRRanked-Windows-1.16.1-RSG.mrpack'

/** Mod id/filename prefixes that are ranked-only and must be excluded from RSG. */
export const RSG_EXCLUDE_PREFIXES = ['mcsrranked', 'mcsrfairplay']

/**
 * The only origins pack and mod bytes may come from. The .mrpack itself carries no hash
 * (upstream re-publishes it freely — pinning would break every pack update until an app
 * release), so the fetch is the trust root: HTTPS to one of these hosts, checked again on
 * the post-redirect URL. Per-file sha512s and safeJoin containment take it from there.
 */
export const TRUSTED_DOWNLOAD_HOSTS: ReadonlySet<string> = new Set([
  'redlime.github.io', // the MCSR modpack
  'cdn.modrinth.com', // pack files + ranked mod jars
  'api.modrinth.com', // Modrinth version metadata
  // The MCSR pack hosts almost every mod in the legal-mods GitHub repo: the index links
  // github.com/.../raw/... URLs, which 302 to raw.githubusercontent.com — both the link and its
  // redirect target must pass. objects/release-assets cover mods served as GitHub release assets.
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
])

export function assertTrustedDownloadUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error(`Refusing malformed download URL: ${url}`)
  }
  if (u.protocol !== 'https:' || !TRUSTED_DOWNLOAD_HOSTS.has(u.hostname)) {
    throw new Error(`Refusing untrusted download URL: ${url}`)
  }
  return url
}

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

/**
 * Resolve a pack-supplied relative path inside `root`, refusing anything that escapes it.
 *
 * Paths in modrinth.index.json are remote input: `join()` happily collapses `../`, so
 * without this a hostile or compromised pack could write outside the instance — e.g. into
 * the Windows Startup folder, turning "mods run in the game JVM" into "native code at login".
 */
export function safeJoin(root: string, rel: string): string {
  const dest = resolve(root, rel)
  const rp = relative(root, dest)
  if (rp === '' || rp.startsWith('..') || isAbsolute(rp)) {
    throw new Error(`Refusing out-of-bounds pack path: ${rel}`)
  }
  return dest
}

/**
 * Verify a downloaded buffer against the pack hashes (sha512 preferred).
 *
 * Fails closed: a file with no hash cannot be verified, so it is rejected rather than
 * accepted. (Every file in the upstream pack ships a sha512, so this is not a real
 * constraint in practice — it just removes "omit the hashes" as a bypass.)
 */
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
  throw new Error('no hash to verify against')
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
  assertTrustedDownloadUrl(url)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`)
  if (res.url) assertTrustedDownloadUrl(res.url) // a redirect must not escape the allowlist
  return Buffer.from(await res.arrayBuffer())
}

/** Download + unzip the .mrpack and return its parsed index. */
export async function fetchPack(
  url = MCSR_MRPACK_URL,
  fetchBuffer: FetchBuffer = nodeFetchBuffer
): Promise<ModrinthIndex> {
  assertTrustedDownloadUrl(url)
  const buf = await fetchBuffer(url)
  // mkdtemp: a fixed Date.now() name is guessable and mkdirSync(recursive) happily reuses
  // a directory someone else pre-created, letting them own/replace files mid-extract.
  const work = mkdtempSync(join(tmpdir(), 'mcsr-mrpack-'))
  const zipPath = join(work, 'pack.mrpack')
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
    const dest = safeJoin(gameDir, file.path)
    mkdirSync(dirname(dest), { recursive: true })

    let lastErr: unknown
    let ok = false
    for (const url of file.downloads) {
      try {
        assertTrustedDownloadUrl(url)
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

// Latest MCSR Ranked mod, straight from Modrinth (newest 1.16.1 Fabric release).
const RANKED_MODRINTH_VERSIONS =
  'https://api.modrinth.com/v2/project/mcsr-ranked/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.16.1%22%5D'

interface ModrinthVersion {
  version_number: string
  date_published: string
  files: { url: string; filename: string; primary: boolean; hashes: { sha512?: string; sha1?: string } }[]
}

/**
 * Replace the Ranked instance's bundled ranked mod with the latest from Modrinth, so it
 * always tracks the current release rather than whatever the pack pins. The new jar is
 * written first; only then are older mcsrranked jars pruned, so a failed fetch leaves the
 * pack's copy intact. Returns the installed version number.
 */
export async function installLatestRankedMod(
  gameDir: string,
  fetchBuffer: FetchBuffer = nodeFetchBuffer
): Promise<string> {
  const res = await fetch(RANKED_MODRINTH_VERSIONS, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Modrinth lookup failed (${res.status})`)
  const versions = (await res.json()) as ModrinthVersion[]
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('No MCSR Ranked release found on Modrinth')
  }
  const latest = versions.reduce((a, b) => (a.date_published >= b.date_published ? a : b))
  const file = latest.files.find((f) => f.primary) ?? latest.files[0]
  if (!file) throw new Error('MCSR Ranked release has no downloadable file')

  assertTrustedDownloadUrl(file.url)
  const buf = await fetchBuffer(file.url)
  verifyBuffer(buf, file.hashes)
  const modsDir = join(gameDir, 'mods')
  mkdirSync(modsDir, { recursive: true })
  // The filename comes from a remote API response; keep it a bare .jar basename so it
  // cannot escape mods/.
  const jarName = basename(file.filename)
  if (!jarName || !/\.jar$/i.test(jarName)) {
    throw new Error(`Unexpected mod filename from Modrinth: ${file.filename}`)
  }
  writeFileSync(join(modsDir, jarName), buf)

  // Drop the pack's pinned ranked jar(s) now that the latest is in place.
  for (const f of readdirSync(modsDir)) {
    if (f !== jarName && f.toLowerCase().startsWith('mcsrranked')) {
      try {
        rmSync(join(modsDir, f), { force: true })
      } catch {
        /* best effort */
      }
    }
  }
  return latest.version_number
}
