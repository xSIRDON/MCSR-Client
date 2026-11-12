import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, cpSync, renameSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { unzip } from '../security/safe-unzip'
import { logFailure } from '../log'

export const MCSR_MRPACK_URL =
  'https://redlime.github.io/MCSRMods/modpacks/v4/MCSRRanked-Windows-1.16.1-RSG.mrpack'

export const RSG_EXCLUDE_PREFIXES = ['mcsrranked', 'mcsrfairplay']

export const TRUSTED_DOWNLOAD_HOSTS: ReadonlySet<string> = new Set([
  'redlime.github.io',
  'cdn.modrinth.com',
  'api.modrinth.com',
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
  if (GITHUB_PATH_HOSTS.has(u.hostname) && !u.pathname.startsWith(`/${TRUSTED_GITHUB_OWNER}/`)) {
    throw new Error(`Refusing untrusted download URL: ${url}`)
  }
  return url
}

const TRUSTED_GITHUB_OWNER = 'Minecraft-Java-Edition-Speedrunning'
const GITHUB_PATH_HOSTS: ReadonlySet<string> = new Set(['github.com', 'raw.githubusercontent.com'])

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

export function parseIndex(json: unknown): ModrinthIndex {
  const idx = json as ModrinthIndex
  if (!idx || idx.game !== 'minecraft' || !Array.isArray(idx.files)) {
    throw new Error('Not a valid modrinth.index.json')
  }
  return idx
}

export function filterMods(files: PackFile[], excludePrefixes: string[]): PackFile[] {
  if (excludePrefixes.length === 0) return files
  return files.filter((f) => {
    const base = f.path.split('/').pop() ?? f.path
    return !excludePrefixes.some((p) => base.toLowerCase().startsWith(p.toLowerCase()))
  })
}

export function safeJoin(root: string, rel: string): string {
  const dest = resolve(root, rel)
  const rp = relative(root, dest)
  if (rp === '' || rp.startsWith('..') || isAbsolute(rp)) {
    throw new Error(`Refusing out-of-bounds pack path: ${rel}`)
  }
  return dest
}

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

export interface PackModUpgrade {
  replaces: string
  path: string
  urls: string[]
  sha512: string
}

export const PACK_MOD_UPGRADES: readonly PackModUpgrade[] = [
  {
    replaces: 'mods/hermes-0.12.5+MC1.16.1.jar',
    path: 'mods/hermes-0.15.1+MC1.16.1.jar',
    urls: [
      'https://github.com/Minecraft-Java-Edition-Speedrunning/legal-mods/raw/d6ed9613e0cf3a2291b8e756ed10a0b127ce632f/legal-mods/hermes/1.16.1/hermes-0.15.1+MC1.16.1.jar'
    ],
    sha512:
      '2924a72bfc55b4b911a6b5920ff88e2c1a3bc2747da806b4be019eb56a3612233e83f948a43f1f6d8d2fecd57124c8a4573e051659525a312f84536b0c26a94c'
  }
]

export function applyModUpgrades(files: PackFile[], upgrades: readonly PackModUpgrade[]): PackFile[] {
  return files.map((f) => {
    const up = upgrades.find((u) => u.replaces === f.path)
    return up ? { ...f, path: up.path, hashes: { sha512: up.sha512 }, downloads: [...up.urls] } : f
  })
}

export function fabricVersionString(index: ModrinthIndex): string {
  const loader = index.dependencies['fabric-loader']
  const mc = index.dependencies['minecraft']
  if (!loader || !mc) throw new Error('Pack missing fabric-loader/minecraft dependency')
  return `fabric-loader-${loader}-${mc}`
}

type FetchBuffer = (url: string) => Promise<Buffer>

export function writeAtomic(dest: string, buf: Buffer): void {
  const tmp = `${dest}.part`
  writeFileSync(tmp, buf)
  renameSync(tmp, dest)
}

const STALL_MS = 30_000

const nodeFetchBuffer: FetchBuffer = async (url) => {
  assertTrustedDownloadUrl(url)
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const arm = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(new Error(`download stalled for ${url}`)), STALL_MS)
  }
  arm()
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal })
    if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`)
    if (res.url) assertTrustedDownloadUrl(res.url)
    const chunks: Buffer[] = []
    if (res.body) {
      for await (const chunk of res.body) {
        chunks.push(Buffer.from(chunk))
        arm()
      }
    }
    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timer)
  }
}

async function fetchWithRetry(fetchBuffer: FetchBuffer, url: string, tries: number, delayMs: number): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchBuffer(url)
    } catch (e) {
      if (attempt >= tries || /failed 4\d\d/.test(String(e))) throw e
      await new Promise((r) => setTimeout(r, delayMs * attempt))
    }
  }
}

function alreadyInstalled(dest: string, hashes: PackFile['hashes']): boolean {
  if (!existsSync(dest)) return false
  try {
    verifyBuffer(readFileSync(dest), hashes)
    return true
  } catch {
    return false
  }
}

export async function fetchPack(
  url = MCSR_MRPACK_URL,
  fetchBuffer: FetchBuffer = nodeFetchBuffer
): Promise<ModrinthIndex> {
  assertTrustedDownloadUrl(url)
  const buf = await fetchBuffer(url)
  const work = mkdtempSync(join(tmpdir(), 'mcsr-mrpack-'))
  const zipPath = join(work, 'pack.mrpack')
  writeFileSync(zipPath, buf)
  try {
    await unzip(zipPath, work)
    const indexPath = join(work, 'modrinth.index.json')
    const index = parseIndex(JSON.parse(readFileSync(indexPath, 'utf8')))
    return index
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export interface InstallOpts {
  excludePrefixes?: string[]
  upgrades?: readonly PackModUpgrade[]
  seedQueueOverride?: string | null
  onProgress?: (done: number, total: number, label: string) => void
  fetchBuffer?: FetchBuffer
  retryDelayMs?: number
}

export async function installPackFiles(
  index: ModrinthIndex,
  gameDir: string,
  opts: InstallOpts = {}
): Promise<string[]> {
  const fetchBuffer = opts.fetchBuffer ?? nodeFetchBuffer
  let files = applyModUpgrades(filterMods(index.files, opts.excludePrefixes ?? []), opts.upgrades ?? [])

  if (opts.seedQueueOverride) {
    files = files.filter((f) => !(f.path.split('/').pop() ?? '').toLowerCase().startsWith('seedqueue'))
  }

  const total = files.length
  let done = 0
  for (const file of files) {
    opts.onProgress?.(done, total, file.path.split('/').pop() ?? file.path)
    const dest = safeJoin(gameDir, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    if (alreadyInstalled(dest, file.hashes)) {
      done++
      continue
    }

    let lastErr: unknown
    let ok = false
    for (const url of file.downloads) {
      try {
        assertTrustedDownloadUrl(url)
        const buf = await fetchWithRetry(fetchBuffer, url, 3, opts.retryDelayMs ?? 2000)
        verifyBuffer(buf, file.hashes)
        writeAtomic(dest, buf)
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
  return files.map((f) => f.path)
}

const RANKED_MODRINTH_VERSIONS =
  'https://api.modrinth.com/v2/project/mcsr-ranked/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.16.1%22%5D'

interface ModrinthVersion {
  version_number: string
  date_published: string
  files: { url: string; filename: string; primary: boolean; hashes: { sha512?: string; sha1?: string } }[]
}

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
  const modsDir = join(gameDir, 'mods')
  mkdirSync(modsDir, { recursive: true })
  const jarName = basename(file.filename)
  if (!jarName || !/\.jar$/i.test(jarName)) {
    throw new Error(`Unexpected mod filename from Modrinth: ${file.filename}`)
  }
  if (!alreadyInstalled(join(modsDir, jarName), file.hashes)) {
    const buf = await fetchWithRetry(fetchBuffer, file.url, 3, 2000)
    verifyBuffer(buf, file.hashes)
    writeAtomic(join(modsDir, jarName), buf)
  }

  for (const f of readdirSync(modsDir)) {
    if (f !== jarName && f.toLowerCase().startsWith('mcsrranked')) {
      try {
        rmSync(join(modsDir, f), { force: true })
      } catch (e) {
        logFailure(`Could not remove old ranked mod ${f}, delete it from the mods folder`, e)
      }
    }
  }
  return latest.version_number
}
