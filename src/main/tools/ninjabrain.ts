import { app } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'
import { fetchVerified } from '../security/verified-download'

export const NINJABRAIN_JAR = 'Ninjabrain-Bot-1.5.2.jar'
const DOWNLOAD =
  'https://github.com/Ninjabrain1/Ninjabrain-Bot/releases/download/1.5.2/Ninjabrain-Bot-1.5.2.jar'
const DOWNLOAD_SHA512 =
  'c07b5c9b63e066b9efd68225b05f05b31e48ce6c2921cac98f52b609d20deabbf7a263d37c6ca791edbf01b176e63c0e397bcabd177456a3ebd9b2eb2f647706'

function jarPath(): string {
  return join(paths.tools(), NINJABRAIN_JAR)
}

async function downloadJar(): Promise<void> {
  mkdirSync(paths.tools(), { recursive: true })
  writeFileSync(jarPath(), await fetchVerified(DOWNLOAD, DOWNLOAD_SHA512, 'Ninjabrain Bot'))
}

export async function setupNinjabrain(): Promise<void> {
  if (!existsSync(jarPath())) await downloadJar()
}

export function removeDesktopShortcut(): void {
  if (process.platform !== 'win32') return
  try {
    const lnk = join(app.getPath('desktop'), 'Ninjabrain Bot.lnk')
    if (existsSync(lnk)) rmSync(lnk)
  } catch {
  }
}

function isRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "@(Get-CimInstance Win32_Process -Filter \"Name='javaw.exe' OR Name='java.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*Ninjabrain-Bot*' }).Count"
      ],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => resolve(!err && parseInt(String(stdout).trim(), 10) > 0)
    )
  })
}

export async function launchNinjabrain(javaw = 'javaw'): Promise<ChildProcess | null> {
  if (!existsSync(jarPath())) await downloadJar()
  if (await isRunning()) return null
  const child = spawn(javaw, ['-jar', jarPath()], {
    cwd: paths.tools(),
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', () => {
  })
  child.unref()
  return child
}

export function killNinjabrain(): void {
  if (process.platform !== 'win32') return
  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='javaw.exe' OR Name='java.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*Ninjabrain-Bot*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    ],
    { windowsHide: true, timeout: 5000 },
    () => {}
  )
}
