// Copy a player's settings from one instance's .minecraft into another. Used both by a
// first-time install ("import from another instance") and the Edit-instance page.

import { existsSync, copyFileSync, cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Copy the settings a speedrunner cares about from `srcGameDir` into `dstGameDir`:
 *   - options.txt   — keybinds, sensitivity, video settings
 *   - hotbar.nbt    — saved hotbars (only if the source has one)
 *   - config/       — the whole folder, recursively: this includes standardoptions.txt
 *                     (the options applied to world saves) and every mod's config
 *
 * World saves themselves are deliberately left untouched. Returns the list of items
 * copied, for UI feedback. Best-effort per item; overwrites matching files in the target.
 */
export function copyInstanceSettings(srcGameDir: string, dstGameDir: string): string[] {
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

  return copied
}
