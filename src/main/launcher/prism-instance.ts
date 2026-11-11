import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { isInstanceId, type InstanceId } from '../../shared/types'
import { instanceCfg, mmcPack, type PackInfo } from '../instances/export-pack'

export function atomicText(file: string, text: string): void {
  const temporary = `${file}.tmp`
  writeFileSync(temporary, text, { mode: 0o600 })
  renameSync(temporary, file)
}

export const system32 = (exe: string): string => join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', exe)

export function prismRunning(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ESRCH'
    }
  }
  try {
    const out = execFileSync(system32('tasklist.exe'), ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8'
    })
    return out.toLowerCase().startsWith('"prismlauncher.exe"')
  } catch {
    return true
  }
}

export function prismSessionActive(root: string): boolean {
  const file = join(root, 'session.lock')
  if (!existsSync(file)) return false
  return prismRunning(Number(readFileSync(file, 'utf8')))
}

export function detachPrismInstance(root: string, id: InstanceId, gameDir: string): void {
  if (!isInstanceId(id)) throw new Error('Unknown instance.')
  if (prismSessionActive(root)) throw new Error('Close Minecraft before deleting this instance.')
  const instance = join(root, 'instances', id)
  if (!existsSync(instance)) return
  if (readFileSync(join(instance, '.mcsr-managed'), 'utf8') !== realpathSync(gameDir)) {
    throw new Error('Refusing to delete an unmanaged Prism instance.')
  }
  const link = join(instance, '.minecraft')
  if (!lstatSync(link).isSymbolicLink() || realpathSync(link) !== realpathSync(gameDir)) {
    throw new Error('The managed Prism instance points to different game files.')
  }
  unlinkSync(link)
  rmSync(instance, { recursive: true, force: true })
}

export function iniPath(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid path in Prism configuration.')
  const encoded = value.replace(/\\/g, '/').replace(/#/g, '\\#').replace(/"/g, '\\"')
  return /[;=,]/.test(value) ? `"${encoded}"` : encoded
}

export function preparePrismInstance(
  root: string, id: InstanceId, gameDir: string, info: PackInfo, java: string, jvmArgs: string[] = []
): string {
  if (!isInstanceId(id)) throw new Error('Unknown instance.')
  const target = realpathSync(gameDir)
  const destination = join(root, 'instances', id)
  const existing = existsSync(destination)
  let instance = destination
  if (existing) {
    const marker = join(instance, '.mcsr-managed')
    if (!existsSync(marker) || readFileSync(marker, 'utf8') !== target) {
      throw new Error('Refusing to replace an unmanaged Prism instance.')
    }
  } else {
    const staging = join(root, '.staging')
    mkdirSync(staging, { recursive: true })
    mkdirSync(join(root, 'instances'), { recursive: true })
    instance = mkdtempSync(join(staging, `${id}-`))
    atomicText(join(instance, '.mcsr-managed'), target)
  }
  const link = join(instance, '.minecraft')
  let present = false
  try { present = !!lstatSync(link) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (present) {
    if (!lstatSync(link).isSymbolicLink() || realpathSync(link) !== target) {
      throw new Error('The managed Prism instance points to different game files.')
    }
  } else {
    symlinkSync(resolve(gameDir), link, process.platform === 'win32' ? 'junction' : 'dir')
  }
  atomicText(join(instance, 'mmc-pack.json'), mmcPack(info))
  atomicText(join(instance, 'instance.cfg'), '[General]\n' + instanceCfg(info) + [
    'OverrideJavaLocation=true', `JavaPath=${iniPath(java)}`,
    'IgnoreJavaCompatibility=true', 'OverrideJavaArgs=true',
    `JvmArgs=${iniPath(jvmArgs.join(' '))}`, 'OverrideCommands=true', 'PreLaunchCommand=', 'WrapperCommand=', 'PostExitCommand=',
    'OverrideConsole=true', 'ShowConsole=false', 'ShowConsoleOnError=false', 'LowMemWarning=false', ''
  ].join('\n'))
  if (!existing) renameSync(instance, destination)
  return destination
}
