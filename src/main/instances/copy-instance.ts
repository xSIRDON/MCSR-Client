import { existsSync, copyFileSync, cpSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

export function listWorlds(gameDir: string): string[] {
  const saves = join(gameDir, 'saves')
  if (!existsSync(saves)) return []
  try {
    return readdirSync(saves, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

export function copyInstanceSettings(
  srcGameDir: string,
  dstGameDir: string,
  opts: { worlds?: string[] } = {}
): string[] {
  const copied: string[] = []
  mkdirSync(dstGameDir, { recursive: true })

  for (const file of ['options.txt', 'hotbar.nbt']) {
    const src = join(srcGameDir, file)
    if (existsSync(src)) {
      copyFileSync(src, join(dstGameDir, file))
      copied.push(file)
    }
  }

  for (const [folder, label] of [
    ['config', 'config/'],
    ['resourcepacks', 'resource packs']
  ] as const) {
    const src = join(srcGameDir, folder)
    if (existsSync(src)) {
      cpSync(src, join(dstGameDir, folder), { recursive: true })
      copied.push(label)
    }
  }

  let worlds = 0
  for (const world of opts.worlds ?? []) {
    if (world !== basename(world) || world === '.' || world === '..') continue
    const src = join(srcGameDir, 'saves', world)
    if (existsSync(src)) {
      cpSync(src, join(dstGameDir, 'saves', world), { recursive: true })
      worlds++
    }
  }
  if (worlds > 0) copied.push(`${worlds} world${worlds === 1 ? '' : 's'}`)

  return copied
}

export function resolveGameDir(folder: string): string {
  const looksLikeGameDir = ['options.txt', 'config', 'hotbar.nbt', 'saves', 'mods', 'resourcepacks'].some(
    (n) => existsSync(join(folder, n))
  )
  if (looksLikeGameDir) return folder
  for (const sub of ['.minecraft', 'minecraft']) {
    if (existsSync(join(folder, sub))) return join(folder, sub)
  }
  return folder
}
