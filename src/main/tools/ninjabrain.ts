import { app, shell } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'

export const NINJABRAIN_JAR = 'Ninjabrain-Bot-1.5.2.jar'
const DOWNLOAD =
  'https://github.com/Ninjabrain1/Ninjabrain-Bot/releases/download/1.5.2/Ninjabrain-Bot-1.5.2.jar'

function jarPath(): string {
  return join(paths.tools(), NINJABRAIN_JAR)
}

async function downloadJar(): Promise<void> {
  mkdirSync(paths.tools(), { recursive: true })
  const res = await fetch(DOWNLOAD, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Ninjabrain Bot download failed (${res.status})`)
  writeFileSync(jarPath(), Buffer.from(await res.arrayBuffer()))
}

export function createDesktopShortcut(): void {
  if (process.platform !== 'win32') return
  try {
    const lnk = join(app.getPath('desktop'), 'Ninjabrain Bot.lnk')
    shell.writeShortcutLink(lnk, {
      target: jarPath(),
      cwd: paths.tools(),
      description: 'Ninjabrain Bot — stronghold calculator'
    })
  } catch {
  }
}

export async function setupNinjabrain(): Promise<void> {
  if (!existsSync(jarPath())) await downloadJar()
  createDesktopShortcut()
}
