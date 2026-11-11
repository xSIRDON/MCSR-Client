import extract from 'extract-zip'
import type { Entry } from 'yauzl'

const IFMT = 0o170000
const IFLNK = 0o120000

export function refuseLinks(entry: Entry): void {
  if (((entry.externalFileAttributes >>> 16) & IFMT) === IFLNK) {
    throw new Error(`Refusing link entry in archive: ${entry.fileName}`)
  }
}

export function unzip(zip: string, dir: string): Promise<void> {
  return extract(zip, { dir, onEntry: refuseLinks })
}
