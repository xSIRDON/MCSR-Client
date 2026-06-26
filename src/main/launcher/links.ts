import { lstatSync, unlinkSync, rmSync } from 'node:fs'

export function removeLinkIfPresent(linkPath: string): void {
  let stat
  try {
    stat = lstatSync(linkPath)
  } catch {
    return
  }

  if (stat.isSymbolicLink()) {
    try {
      unlinkSync(linkPath)
    } catch {
      try {
        rmSync(linkPath, { recursive: true, force: true })
      } catch {
      }
    }
  } else if (stat.isDirectory()) {
    try {
      unlinkSync(linkPath)
    } catch {
    }
  }
}
