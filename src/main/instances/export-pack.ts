import { createWriteStream, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ZipFile } from 'yazl'

export interface PackInfo {
  name: string
  minecraft: string
  loader: string
  ramMb: number
}

const SKIP = [
  'assets',
  'libraries',
  'versions',
  'natives',
  'logs',
  'crash-reports',
  'saves',
  'screenshots',
  'hermes',
  'mcsrranked/replay',
  'mcsrranked/replay-cached',
  'mcsrranked/temp-replay',
  'usercache.json',
  'servers.dat_old',
  'Toolscreen.jar',
  'imgui.ini',
  'wpstateout.txt',
  '.mcsr-version',
  '.mcsr-last-session.json',
  '.fabric'
]

function skipped(rel: string): boolean {
  if (/^mcsrranked\/matches-.*\.json$/.test(rel) || rel.endsWith('.log')) return true
  return SKIP.some((s) => rel === s || rel.startsWith(s + '/'))
}

export function packFiles(gameDir: string, rel = ''): string[] {
  const out: string[] = []
  for (const e of readdirSync(join(gameDir, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (skipped(path)) continue
    if (e.isDirectory()) out.push(...packFiles(gameDir, path))
    else if (e.isFile()) out.push(path)
  }
  return out
}

export function instanceCfg(p: PackInfo): string {
  return [
    'InstanceType=OneSix',
    `name=${p.name}`,
    'iconKey=default',
    'OverrideMemory=true',
    `MaxMemAlloc=${p.ramMb}`,
    'MinMemAlloc=512',
    ''
  ].join('\n')
}

export function mmcPack(p: PackInfo): string {
  const components = [
    { uid: 'org.lwjgl3', version: '3.2.2', dependencyOnly: true },
    { uid: 'net.minecraft', version: p.minecraft, important: true },
    { uid: 'net.fabricmc.intermediary', version: p.minecraft, dependencyOnly: true },
    { uid: 'net.fabricmc.fabric-loader', version: p.loader }
  ]
  return JSON.stringify({ formatVersion: 1, components }, null, 2)
}

export function exportPack(gameDir: string, dest: string, info: PackInfo): Promise<number> {
  const files = packFiles(gameDir)
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from(instanceCfg(info)), 'instance.cfg')
  zip.addBuffer(Buffer.from(mmcPack(info)), 'mmc-pack.json')
  for (const f of files) zip.addFile(join(gameDir, f), `.minecraft/${f}`)
  zip.end()
  return new Promise((resolve, reject) => {
    zip.outputStream.on('error', reject)
    zip.outputStream
      .pipe(createWriteStream(dest))
      .on('error', reject)
      .on('close', () => resolve(files.length))
  })
}
