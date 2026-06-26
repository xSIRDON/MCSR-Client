// Copy a player's settings from one instance's .minecraft into another. Used both by a
// first-time install ("import from another instance") and the Edit-instance page.

import { existsSync, copyFileSync, cpSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** List the world folders (under saves/) in a game dir, for the import picker. */
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

/**
 * Copy the settings a speedrunner cares about from `srcGameDir` into `dstGameDir`:
 *   - options.txt   — keybinds, sensitivity, video settings
 *   - hotbar.nbt    — saved hotbars (only if the source has one)
 *   - config/       — the whole folder, recursively: standardoptions.txt + every mod's config
 *   - saves/<name>  — only the worlds named in `opts.worlds` (the player picks which)
 *
 * Returns the list of items copied, for UI feedback. Best-effort per item; overwrites matching
 * files/worlds in the target.
 */
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

  const srcConfig = join(srcGameDir, 'config')
  if (existsSync(srcConfig)) {
    cpSync(srcConfig, join(dstGameDir, 'config'), { recursive: true })
    copied.push('config/')
  }

  let worlds = 0
  for (const world of opts.worlds ?? []) {
    const src = join(srcGameDir, 'saves', world)
    if (existsSync(src)) {
      cpSync(src, join(dstGameDir, 'saves', world), { recursive: true })
      worlds++
    }
  }
  if (worlds > 0) copied.push(`${worlds} world${worlds === 1 ? '' : 's'}`)

  return copied
}

/**
 * Resolve the actual game directory inside an arbitrary folder the user picked. The folder may
 * already be a `.minecraft` (it has the tell-tale files), or it may be a launcher's instance
 * folder that contains a `.minecraft` / `minecraft` subfolder (MultiMC, Prism, …). Falls back to
 * the folder itself.
 */
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
