import { lstatSync, unlinkSync, rmSync } from 'node:fs'

/**
 * Remove a stale symlink/junction at `linkPath`, if one exists, without ever
 * deleting the data it points at.
 *
 * Why this exists: GMLL re-creates each instance's `libraries`/`assets` junction
 * on every install/launch via gfsl, whose link helper does
 * `if (existsSync(path)) unlinkSync(path); symlinkSync(...)`. On Windows,
 * `existsSync` can report an existing junction as missing, so gfsl skips its own
 * unlink, `symlinkSync` then throws `EEXIST`, and gfsl responds by calling
 * `process.exit()` — hard-killing the whole Electron app. Clearing the junction
 * ourselves first (via `lstat`, which never follows the link) keeps gfsl on its
 * reliable "create fresh" path.
 *
 * Safety: a *real* directory is left untouched — we only drop links — so the
 * shared libraries/assets the junction targets can never be destroyed here.
 */
export function removeLinkIfPresent(linkPath: string): void {
  let stat
  try {
    stat = lstatSync(linkPath) // lstat does NOT follow the link; throws if absent
  } catch {
    return // nothing there
  }

  if (stat.isSymbolicLink()) {
    try {
      unlinkSync(linkPath)
    } catch {
      try {
        rmSync(linkPath, { recursive: true, force: true })
      } catch {
        /* give up — caller will surface any downstream failure */
      }
    }
  } else if (stat.isDirectory()) {
    // Windows commonly reports a junction as a directory. `unlinkSync` drops the
    // junction link without touching its target; a genuine directory throws here
    // (you cannot unlink a directory) and is therefore left intact.
    try {
      unlinkSync(linkPath)
    } catch {
      /* a real directory — leave it alone */
    }
  }
}
