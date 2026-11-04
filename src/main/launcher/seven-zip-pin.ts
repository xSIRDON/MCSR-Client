import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PINNED: Record<string, Record<string, string>> = {
  x64: {
    '7za.exe': '22709ad7f3ec4c27517fc360194e174394bfa3f09ccff5e013521ec306dc2df9',
    '7za.dll': '0bbcc7bfc688a512911fbe679bbd279928f1b463431139685ebe39a98798134e',
    '7zxa.dll': '0bbcc7bfc688a512911fbe679bbd279928f1b463431139685ebe39a98798134e'
  }
}

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex')

export function verifySevenZip(binDir: string, arch: string = process.arch): void {
  const pins = PINNED[arch]
  if (!pins) return
  const dir = join(binDir, '7z')
  for (const [name, hash] of Object.entries(pins)) {
    const file = join(dir, name)
    if (existsSync(file) && sha256(file) === hash) continue
    rmSync(dir, { recursive: true, force: true })
    throw new Error(
      `The 7-Zip tool the game installer downloaded (${name}) didn't match the known-good copy, so it was removed and not run. Try again later.`
    )
  }
}
