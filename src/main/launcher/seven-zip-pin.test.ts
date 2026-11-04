import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifySevenZip } from './seven-zip-pin'

describe('verifySevenZip', () => {
  it('removes and refuses a 7-Zip that does not match the pins', () => {
    const bin = mkdtempSync(join(tmpdir(), 'pin-'))
    mkdirSync(join(bin, '7z'))
    for (const f of ['7za.exe', '7za.dll', '7zxa.dll']) writeFileSync(join(bin, '7z', f), 'not 7-zip')
    expect(() => verifySevenZip(bin, 'x64')).toThrow(/didn't match/)
    expect(existsSync(join(bin, '7z'))).toBe(false)
  })

  it('leaves architectures without pins alone', () => {
    const bin = mkdtempSync(join(tmpdir(), 'pin-'))
    expect(() => verifySevenZip(bin, 'arm64')).not.toThrow()
  })
})
