import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promisify } from 'node:util'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InstanceId, ProgressEvent } from '../../shared/types'
import * as auth from '../auth/msmc-auth'
import { paths } from '../paths'
import { store } from '../store'
import { logFailure } from '../log'
import { MSA_CLIENT_ID, prismAccounts, readPrismRefresh, readPrismSecrets } from './prism-account'
import { atomicText, preparePrismInstance, prismRunning } from './prism-instance'
import { ensurePrismRuntime } from './prism-runtime'
import { waitForPrismStart } from './prism-start'

const run = promisify(execFile)

export function prismLaunchSecrets(id: InstanceId): string[] {
  const file = join(paths.root(), 'prism', id, 'accounts.json')
  try { return readPrismSecrets(JSON.parse(readFileSync(file, 'utf8'))) } catch {
    return []
  }
}

function recoverAccount(file: string): void {
  if (!existsSync(file)) return
  let value: unknown
  try { value = JSON.parse(readFileSync(file, 'utf8')) } catch {
    throw new Error('Managed Prism account data could not be read.')
  }
  const account = readPrismRefresh(value)
  if (!account) throw new Error('Managed Prism account data could not be recovered.')
  auth.savePrismRefresh(account.uuid, account.refreshToken)
  unlinkSync(file)
}

function acquireLock(file: string): void {
  if (existsSync(file)) {
    if (prismRunning(Number(readFileSync(file, 'utf8')))) {
      throw new Error('This instance is already open. Close Minecraft before launching again.')
    }
    unlinkSync(file)
  }
  const fd = openSync(file, 'wx', 0o600)
  try { writeFileSync(fd, String(process.pid)) } finally { closeSync(fd) }
}

export async function launchPrism(
  id: InstanceId, gameDir: string, fabricVersion: string, java: string,
  progress: (event: ProgressEvent) => void, jvmArgs: string[] = []
): Promise<ChildProcessWithoutNullStreams> {
  const executable = await ensurePrismRuntime((message) => progress({ instance: id, phase: 'launch', fraction: null, message }))
  const root = join(paths.root(), 'prism', id)
  mkdirSync(root, { recursive: true })
  const lock = join(root, 'session.lock')
  acquireLock(lock)
  const accounts = join(root, 'accounts.json')
  let child: ChildProcessWithoutNullStreams | undefined
  try {
    const { stdout } = await run('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 5000 })
    const sid = stdout.match(/S-1-[\d-]+/)?.[0]
    if (!sid) throw new Error('Could not secure the managed Prism account directory.')
    await run('icacls.exe', [root, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { windowsHide: true, timeout: 5000 })
    recoverAccount(accounts)
    const account = auth.prismAccount()
    const version = /^fabric-loader-([\d.]+)-([\d.]+)$/.exec(fabricVersion)
    if (!version) throw new Error('Invalid Minecraft/Fabric version for Prism.')
    preparePrismInstance(root, id, gameDir, {
      name: `MCSR ${id.toUpperCase()}`, loader: version[1], minecraft: version[2], ramMb: store.getConfig().ram[id]
    }, java, jvmArgs)
    atomicText(join(root, 'prismlauncher.cfg'), [
      '[General]', 'Language=en_US', 'ApplicationTheme=dark', 'IconTheme=pe_colored',
      'IgnoreJavaWizard=true', 'AutomaticJavaDownload=false', 'AutomaticJavaSwitch=false',
      'UserAskedAboutAutomaticJavaDownload=true', `MSAClientIDOverride=${MSA_CLIENT_ID}`,
      'ShowConsole=false', 'ShowConsoleOnError=false', 'CloseAfterLaunch=false', 'QuitAfterGameStop=true', ''
    ].join('\n'))
    atomicText(accounts, JSON.stringify(prismAccounts(account)))
    progress({ instance: id, phase: 'launch', fraction: null, message: 'Starting Minecraft through Prism…' })
    child = spawn(executable, ['-platform', 'offscreen', '--dir', root, '--launch', id], { windowsHide: true, stdio: 'pipe' })
    const prism = child
    prism.once('close', () => {
      try { recoverAccount(accounts) } catch (error) { logFailure('Prism account refresh could not be saved', error) }
      try { unlinkSync(lock) } catch (error) { logFailure('Prism session lock could not be removed', error) }
    })
    if (prism.pid) atomicText(lock, String(prism.pid))
    await waitForPrismStart(prism)
    return prism
  } catch (error) {
    if (child) {
      child.once('error', () => {})
      if (child.exitCode === null && !child.killed) child.kill()
    } else {
      try { recoverAccount(accounts) } finally { unlinkSync(lock) }
    }
    throw error
  }
}
