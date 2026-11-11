import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzip } from '../security/safe-unzip'
import { config } from 'gmll'
import { paths } from '../paths'
import { verifySevenZip } from './seven-zip-pin'

const VERSION = '11.0.3'
const PRISM_URL = `https://github.com/PrismLauncher/PrismLauncher/releases/download/${VERSION}/PrismLauncher-Windows-MSVC-Portable-${VERSION}.zip`
const PRISM_HASH = 'd127c74c0434f2c318f7ece22ea3d884b8862f06824c40eee373c1eeb853de52'
const QT_URL = 'https://download.qt.io/online/qtsdkrepository/windows_x86/desktop/qt6_6102/qt6_6102/qt.qt6.6102.win64_msvc2022_64/6.10.2-0-202601261212qtbase-Windows-Windows_11_24H2-MSVC2022-Windows-Windows_11_24H2-X86_64.7z'
const QT_HASH = 'c4cedcc54d2036ab20b193db113cf324d90f390647f831a522952cc9b158f38b'
const PLUGIN_HASH = 'c8b67c7a233bc1c727f3f8fe1bcd4f4e36f61a5e5b7dbee0913920e178523470'
const EXE_HASH = 'c24c7c84fce7ff1d12c709e0bcc8993aaa2a8cb662381c960ccb7d93c88bc2e3'
const ENTRY_HASH = '5086c5086c78bc74dad6c7fe0e20fe904cfce6d9a67c63fce80f7907ca731eb6'
const run = promisify(execFile)
const hash = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex')
let pending: Promise<string> | undefined

async function download(url: string, expected: string, file: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000), redirect: 'follow' })
  if (!res.ok || !res.url.startsWith('https://')) throw new Error('Prism download failed.')
  const buf = Buffer.from(await res.arrayBuffer())
  if (hash(buf) !== expected) throw new Error('Prism download did not match its verified checksum.')
  writeFileSync(file, buf)
}

export function ensurePrismRuntime(progress: (message: string) => void): Promise<string> {
  return pending ??= provision(progress).catch((error: unknown) => { pending = undefined; throw error })
}

async function provision(progress: (message: string) => void): Promise<string> {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Background Prism launching currently requires Windows x64.')
  }
  const base = join(paths.runtime(), 'prism')
  const destination = join(base, VERSION)
  const executable = join(destination, 'prismlauncher.exe')
  const plugin = join(destination, 'platforms', 'qoffscreen.dll')
  const entry = join(destination, 'jars', 'NewLaunch.jar')
  if ([[executable, EXE_HASH], [plugin, PLUGIN_HASH], [entry, ENTRY_HASH]]
    .every(([file, expected]) => existsSync(file) && hash(readFileSync(file)) === expected)) return executable
  rmSync(destination, { recursive: true, force: true })
  const staging = join(base, `${VERSION}-${randomUUID()}`)
  mkdirSync(staging, { recursive: true })
  progress('Downloading Prism Launcher…')
  const archive = join(staging, 'prism.zip')
  await download(PRISM_URL, PRISM_HASH, archive)
  const extracted = join(staging, 'app')
  await unzip(archive, extracted)
  progress('Preparing Prism background display support…')
  const qt = join(staging, 'qtbase.7z')
  await download(QT_URL, QT_HASH, qt)
  const bin = config.getMeta().bin.sysPath()
  verifySevenZip(bin)
  await run(join(bin, '7z', '7za.exe'), [
    'e', qt, 'plugins/platforms/qoffscreen.dll', `-o${join(extracted, 'platforms')}`, '-y'
  ], { windowsHide: true, timeout: 60_000 })
  if (hash(readFileSync(join(extracted, 'platforms', 'qoffscreen.dll'))) !== PLUGIN_HASH) {
    throw new Error('Prism background display plugin failed verification.')
  }
  renameSync(extracted, destination)
  rmSync(staging, { recursive: true, force: true })
  return executable
}
