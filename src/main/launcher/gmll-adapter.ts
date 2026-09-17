// Thin wrapper over GMLL that owns instance creation, installation, and launch.
// Each MCSR instance gets its own directory (isolated mods/saves) while sharing
// the downloaded JRE, assets, and libraries under the MCSR Client root.

import { init, config, downloader, handler, Instance } from 'gmll'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { paths } from '../paths'
import { store } from '../store'
import { parseJavaVersion } from '../system/java'
import { removeLinkIfPresent } from './links'
import {
  MANAGED_RUNTIME,
  describeJvm,
  jvmArgsFor,
  missingRuntimeFiles,
  pickGc,
  windowsBuildOf,
  withRam,
  type GcKind,
  type RuntimeManifest
} from './jvm'
import type { InstanceId, ProgressEvent } from '../../shared/types'

let initialised = false
let progressSink: ((e: ProgressEvent) => void) | null = null
let activePhaseInstance: InstanceId = 'ranked'

// GMLL's stock JVM flags (G1 tuned for Java 8), snapshotted before launch() starts swapping the
// static list per launch.
const GMLL_JVM_ARGS: readonly string[] = [...Instance.defaultGameArguments]

function emit(e: ProgressEvent): void {
  progressSink?.(e)
}

/** One-time GMLL preflight; points GMLL at the shared MCSR Client directories. */
export async function ensureCore(onProgress?: (e: ProgressEvent) => void): Promise<void> {
  if (onProgress) progressSink = onProgress
  if (initialised) return
  mkdirSync(paths.shared(), { recursive: true })
  mkdirSync(paths.instances(), { recursive: true })
  config.setRoot(paths.shared())
  config.setInstances(paths.instances())
  config.setLauncherName('MCSR Client')

  try {
    const ev = config.getEventListener()
    ev.on('download.progress', (_key: string, index: number, total: number) => {
      emit({
        instance: activePhaseInstance,
        phase: 'assets',
        fraction: total > 0 ? index / total : null,
        message: `Downloading files (${index}/${total})`
      })
    })
    ev.on('download.setup', () => {
      emit({ instance: activePhaseInstance, phase: 'client', fraction: null, message: 'Preparing download…' })
    })
  } catch {
    // Event wiring is best-effort; install still works without granular progress.
  }

  await init()
  initialised = true
}

/**
 * GMLL re-links the shared libraries/assets into the instance directory on every
 * install and launch (via gfsl). gfsl hard-exits the whole process if such a link
 * already exists in a state its existsSync check misses — which happens on Windows
 * once an instance has been installed once. Drop any stale links first so GMLL
 * always takes its reliable "create fresh" path. This never deletes shared data.
 */
function clearSharedLinks(id: InstanceId): void {
  removeLinkIfPresent(join(paths.instanceDir(id), 'libraries'))
  removeLinkIfPresent(join(paths.instanceDir(id), 'assets'))
}

const FABRIC_VERSION_FALLBACK = 'fabric-loader-0.19.2-1.16.1'

export function makeInstance(
  id: InstanceId,
  fabricVersion = FABRIC_VERSION_FALLBACK,
  javaPath: string = store.getConfig().java[id] ?? 'default'
): Instance {
  const cfg = store.getConfig()
  const inst = new Instance({
    name: id,
    version: fabricVersion,
    path: paths.instanceDir(id),
    // GMLL takes GB and emits -Xmx as floor(ram * 1024) MB, so a fractional value keeps the
    // exact MB the player picked (SeedQueue sizing works in 250 MB steps).
    ram: Math.max(1, cfg.ram[id] / 1024)
  })
  // GMLL launches with this.javaPath; "default" is the Java 8 its 1.16.1 manifest asks for.
  inst.javaPath = javaPath
  return inst
}

// ---- Java runtime ----

let managedJava: Promise<string | null> | null = null

/**
 * Path to the managed Java 21 (javaw.exe), downloading it through GMLL on first use — the files
 * come from Mojang's CDN and are size- and sha1-checked. Resolves null when it can't be provisioned
 * (offline on first run, disk trouble); launches then fall back to GMLL's Java 8, and the next call
 * tries again. Download progress is reported against `id` when given.
 */
export function ensureManagedJava(
  id?: InstanceId,
  onProgress?: (e: ProgressEvent) => void
): Promise<string | null> {
  if (onProgress) progressSink = onProgress
  if (id) activePhaseInstance = id
  const pending = (managedJava ??= provisionManagedJava(id).catch(() => null))
  return pending.then((javaw) => {
    if (!javaw && managedJava === pending) managedJava = null
    return javaw
  })
}

async function provisionManagedJava(id?: InstanceId): Promise<string | null> {
  await ensureCore()
  const meta = config.getMeta()
  const manifestFile = meta.runtimes.getFile(`${MANAGED_RUNTIME}.json`)
  if (!manifestFile.exists()) {
    // init() refreshes Mojang's runtime index but doesn't wait for the per-runtime manifests.
    const index = meta.index.getFile('runtime.json')
    if (index.exists()) await downloader.getRuntimeIndexes(index.toJSON())
  }
  if (!manifestFile.exists()) return null
  const manifest = manifestFile.toJSON<RuntimeManifest>()
  const dir = config.getRuntimes().getDir(MANAGED_RUNTIME).sysPath()
  if (missingRuntimeFiles(manifest, dir).length > 0) {
    emit({
      instance: id ?? activePhaseInstance,
      phase: 'java',
      fraction: null,
      message: 'Downloading Java 21…'
    })
    await downloader.runtime(MANAGED_RUNTIME)
    if (missingRuntimeFiles(manifest, dir).length > 0) return null
  }
  const javaw = handler.getJavaPath(MANAGED_RUNTIME)
  return javaw.exists() ? javaw.sysPath() : null
}

/**
 * Whether the managed Java is already downloaded — without initialising GMLL (which refreshes its
 * manifests) or starting a download. Mirrors GMLL's layout under the shared root:
 * platform/<os>/<arch>/runtimes/<component>.
 */
export function managedJavaOnDisk(): boolean {
  if (process.platform !== 'win32') return false
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const bin = join(paths.shared(), 'platform', 'windows', arch, 'runtimes', MANAGED_RUNTIME, 'bin')
  return existsSync(join(bin, 'javaw.exe'))
}

/** The console `java.exe` beside a `javaw.exe` — javaw has no console to print a banner to. */
export function consoleJava(javaPath: string): string {
  if (!/javaw\.exe$/i.test(javaPath)) return javaPath
  const twin = javaPath.replace(/javaw\.exe$/i, 'java.exe')
  return existsSync(twin) ? twin : javaPath
}

interface Probe {
  ok: boolean
  major: number | null
}

const probeCache = new Map<string, Probe>()

/**
 * Run `java <args> -version`: proves this JVM starts with exactly these flags and this heap size
 * (collector supported, heap reservable, no unknown options) and reads its major version. Only
 * successes are cached, so a one-off failure is retried on the next launch.
 */
function probeJvm(javaPath: string, args: string[]): Promise<Probe> {
  const key = JSON.stringify([javaPath, ...args])
  const hit = probeCache.get(key)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    let out = ''
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      const probe = { ok, major: parseJavaVersion(out).major }
      if (ok) probeCache.set(key, probe)
      resolve(probe)
    }
    try {
      const child = spawn(consoleJava(javaPath), [...args, '-version'], { windowsHide: true })
      timer = setTimeout(() => {
        child.kill()
        finish(false)
      }, 20_000)
      child.stdout.on('data', (d) => (out += String(d)))
      child.stderr.on('data', (d) => (out += String(d)))
      child.on('error', () => finish(false))
      child.on('close', (code) => finish(code === 0))
    } catch {
      finish(false)
    }
  })
}

interface JvmChoice {
  javaPath: string
  gc: GcKind
  major: number | null
  label: string
}

/** Pick the Java + collector for a launch, proving the combination starts before committing. */
async function resolveJvm(id: InstanceId, ramMb: number): Promise<JvmChoice> {
  const custom = store.getConfig().java[id]
  const javaPath = custom ?? (await ensureManagedJava(id))
  if (javaPath) {
    const version = await probeJvm(javaPath, [])
    if (version.ok) {
      let gc = pickGc(version.major, process.platform, windowsBuildOf(release()))
      if (gc === 'zgc') {
        const zgc = withRam(jvmArgsFor('zgc', version.major, GMLL_JVM_ARGS), ramMb)
        if (!(await probeJvm(javaPath, zgc)).ok) gc = 'g1'
      }
      return { javaPath, gc, major: version.major, label: describeJvm(version.major, !!custom, gc) }
    }
    // A custom path is the player's call even if it won't answer -version; keep the old behavior.
    if (custom) return { javaPath: custom, gc: 'g1', major: null, label: describeJvm(null, true, 'g1') }
  }
  return { javaPath: 'default', gc: 'g1', major: 8, label: describeJvm(8, false, 'g1') }
}

// Instance.defaultGameArguments is a static GMLL reads mid-launch (after its install checks), so
// launches that need different flags run one at a time.
let launchLock: Promise<unknown> = Promise.resolve()

function withLaunchLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = launchLock.then(fn, fn)
  launchLock = run.catch(() => undefined)
  return run
}

/** The game directory GMLL uses for this instance (where mods/ lives). */
export function gameDir(id: InstanceId): string {
  return makeInstance(id).getDir().path?.join?.('/') ?? paths.instanceDir(id)
}

/** Install the base game + Fabric for an instance (no mods yet). */
export async function installBase(
  id: InstanceId,
  fabricVersion: string,
  onProgress?: (e: ProgressEvent) => void
): Promise<string> {
  await ensureCore(onProgress)
  if (onProgress) progressSink = onProgress
  activePhaseInstance = id
  clearSharedLinks(id)
  emit({ instance: id, phase: 'fabric', fraction: null, message: 'Installing Minecraft 1.16.1 + Fabric…' })
  const inst = makeInstance(id, fabricVersion)
  await inst.install()
  // Fetch the game's Java now so the first launch doesn't stall on it. Best-effort: launch retries.
  if (!store.getConfig().java[id]) await ensureManagedJava(id)
  return inst.getDir().path?.join?.('/') ?? paths.instanceDir(id)
}

/**
 * Launch an instance with the given login token. Resolves with the child process; `log` receives
 * a one-line note of the Java/collector/heap the game was started with.
 */
export async function launch(
  id: InstanceId,
  token: unknown,
  fabricVersion: string,
  onProgress?: (e: ProgressEvent) => void,
  log?: (line: string) => void
): Promise<ChildProcessWithoutNullStreams> {
  await ensureCore(onProgress)
  activePhaseInstance = id
  clearSharedLinks(id)
  emit({ instance: id, phase: 'java', fraction: null, message: 'Preparing Java…' })
  const ramMb = store.getConfig().ram[id]
  const jvm = await resolveJvm(id, ramMb)
  log?.(`Starting on ${jvm.label} with ${ramMb} MB.`)
  emit({ instance: id, phase: 'launch', fraction: null, message: 'Launching…' })
  const inst = makeInstance(id, fabricVersion, jvm.javaPath)
  return withLaunchLock(async () => {
    Instance.defaultGameArguments = jvmArgsFor(jvm.gc, jvm.major, GMLL_JVM_ARGS)
    try {
      // msmc's gmll() token is GMLL-compatible; GMLL's Player type is structurally equivalent.
      return await inst.launch(token as never)
    } finally {
      Instance.defaultGameArguments = [...GMLL_JVM_ARGS]
    }
  })
}
