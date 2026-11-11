import { utilityProcess } from 'electron'
import { init, config, downloader, handler, Instance } from 'gmll'
import installWorkerPath from './install-worker?modulePath'
import type { WorkerMessage } from './install-worker'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { paths } from '../paths'
import { store } from '../store'
import { parseJavaVersion } from '../system/java'
import { removeLinkIfPresent } from './links'
import { verifySevenZip } from './seven-zip-pin'
import {
  MANAGED_RUNTIME,
  describeJvm,
  gcLogArg,
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

const GMLL_JVM_ARGS: readonly string[] = [...Instance.defaultGameArguments]

function emit(e: ProgressEvent): void {
  progressSink?.(e)
}

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
  }

  await init()
  verifySevenZip(config.getMeta().bin.sysPath())
  initialised = true
}

function clearSharedLinks(id: InstanceId): void {
  removeLinkIfPresent(join(paths.instanceDir(id), 'libraries'))
  removeLinkIfPresent(join(paths.instanceDir(id), 'assets'))
}

function linkShared(inst: Instance): void {
  config.getlibraries().linkFrom(inst.getDir().getDir('libraries'))
  config.getAssets().linkFrom(inst.getDir().getDir('assets'))
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
    ram: Math.max(1, cfg.ram[id] / 1024)
  })
  inst.javaPath = javaPath
  return inst
}

let managedJava: Promise<string | null> | null = null

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

export function managedJavaOnDisk(): boolean {
  if (process.platform !== 'win32') return false
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const bin = join(paths.shared(), 'platform', 'windows', arch, 'runtimes', MANAGED_RUNTIME, 'bin')
  return existsSync(join(bin, 'javaw.exe'))
}

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

export async function prismJvm(id: InstanceId): Promise<{ java: string; args: string[]; label: string }> {
  const ramMb = store.getConfig().ram[id]
  const jvm = await resolveJvm(id, ramMb)
  if (jvm.javaPath === 'default') throw new Error('No working Java runtime was found for Prism.')
  const args = withRam(jvmArgsFor(jvm.gc, jvm.major, GMLL_JVM_ARGS), ramMb)
    .filter((arg) => !/^-Xm[sx]/.test(arg))
  if (jvm.gc === 'zgc') {
    mkdirSync(join(paths.instanceDir(id), 'logs'), { recursive: true })
    args.push(gcLogArg())
  }
  return { java: jvm.javaPath, args, label: jvm.label }
}

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
    if (custom) return { javaPath: custom, gc: 'g1', major: null, label: describeJvm(null, true, 'g1') }
  }
  return { javaPath: 'default', gc: 'g1', major: 8, label: describeJvm(8, false, 'g1') }
}

let launchLock: Promise<unknown> = Promise.resolve()

function withLaunchLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = launchLock.then(fn, fn)
  launchLock = run.catch(() => undefined)
  return run
}

export function gameDir(id: InstanceId): string {
  return makeInstance(id).getDir().path?.join?.('/') ?? paths.instanceDir(id)
}

async function useVerifiedFiles(inst: Instance): Promise<void> {
  const version = await inst.getVersion()
  const json = await version.getJSON()
  const natives = config.getNatives()
  if (!natives.exists() || natives.ls().length === 0) await downloader.libraries(json)
  linkShared(inst)
  inst.install = (async () => version) as typeof inst.install
}

function installInWorker(id: InstanceId, fabricVersion: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(installWorkerPath, [], {
      serviceName: 'MCSR Client install',
      stdio: 'ignore'
    })
    let settled = false
    const finish = (err?: Error): void => {
      if (settled) return
      settled = true
      child.kill()
      if (err) reject(err)
      else resolve()
    }
    child.on('message', (m: WorkerMessage) => {
      if (m.type === 'progress') {
        emit({
          instance: id,
          phase: 'assets',
          fraction: m.total > 0 ? m.index / m.total : null,
          message: `Downloading files (${m.index}/${m.total})`
        })
      } else if (m.type === 'setup') {
        emit({ instance: id, phase: 'client', fraction: null, message: 'Preparing download…' })
      } else if (m.type === 'done') {
        finish()
      } else if (m.type === 'error') {
        finish(new Error(m.message))
      }
    })
    child.on('exit', (code) => finish(new Error(`The installer stopped unexpectedly (code ${code}).`)))
    child.postMessage({
      root: paths.shared(),
      instances: paths.instances(),
      id,
      version: fabricVersion,
      path: paths.instanceDir(id),
      ram: Math.max(1, store.getConfig().ram[id] / 1024)
    })
  })
}

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
  await installInWorker(id, fabricVersion)
  if (!store.getConfig().java[id]) await ensureManagedJava(id)
  return inst.getDir().path?.join?.('/') ?? paths.instanceDir(id)
}

export async function launch(
  id: InstanceId,
  token: unknown,
  fabricVersion: string,
  onProgress?: (e: ProgressEvent) => void,
  log?: (line: string) => void,
  opts: { skipVerify?: boolean } = {}
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
  if (opts.skipVerify) await useVerifiedFiles(inst)
  return withLaunchLock(async () => {
    const args = jvmArgsFor(jvm.gc, jvm.major, GMLL_JVM_ARGS)
    if (jvm.gc === 'zgc') {
      mkdirSync(join(paths.instanceDir(id), 'logs'), { recursive: true })
      args.push(gcLogArg())
    }
    Instance.defaultGameArguments = args
    try {
      return await inst.launch(token as never)
    } finally {
      Instance.defaultGameArguments = [...GMLL_JVM_ARGS]
    }
  })
}
