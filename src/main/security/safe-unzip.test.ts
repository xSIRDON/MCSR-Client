import { describe, expect, it } from 'vitest'
import { createWriteStream, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ZipFile } from 'yazl'
import { unzip } from './safe-unzip'

function zip(build: (z: ZipFile) => void): Promise<string> {
  const file = join(mkdtempSync(join(tmpdir(), 'zip-')), 'a.zip')
  const z = new ZipFile()
  build(z)
  z.end()
  return new Promise((resolve) => z.outputStream.pipe(createWriteStream(file)).on('close', () => resolve(file)))
}

describe('unzip', () => {
  it('extracts normal files', async () => {
    const file = await zip((z) => z.addBuffer(Buffer.from('hi'), 'mods/a.txt'))
    const out = mkdtempSync(join(tmpdir(), 'out-'))
    await unzip(file, out)
    expect(readFileSync(join(out, 'mods', 'a.txt'), 'utf8')).toBe('hi')
  })

  it('refuses symlink entries before anything is written through them', async () => {
    const file = await zip((z) => {
      z.addBuffer(Buffer.from('../../outside'), 'link', { mode: 0o120777 })
      z.addBuffer(Buffer.from('owned'), 'link/evil.txt')
    })
    const out = mkdtempSync(join(tmpdir(), 'out-'))
    await expect(unzip(file, out)).rejects.toThrow('Refusing link entry')
    expect(existsSync(join(out, 'link'))).toBe(false)
  })
})
