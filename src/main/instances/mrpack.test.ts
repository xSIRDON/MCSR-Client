import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  parseIndex,
  filterMods,
  verifyBuffer,
  fabricVersionString,
  RSG_EXCLUDE_PREFIXES,
  type ModrinthIndex,
  type PackFile
} from './mrpack'

const sampleFiles: PackFile[] = [
  { path: 'mods/mcsrranked-5.7.12.jar', hashes: {}, downloads: ['https://x/a'] },
  { path: 'mods/mcsrfairplay-1.2.1+1.16.1.jar', hashes: {}, downloads: ['https://x/b'] },
  { path: 'mods/seedqueue-1.7.1+1.16.1.jar', hashes: {}, downloads: ['https://x/c'] },
  { path: 'mods/sodium-2.5.1+1.16.1.jar', hashes: {}, downloads: ['https://x/d'] }
]

const sampleIndex: ModrinthIndex = {
  formatVersion: 1,
  game: 'minecraft',
  versionId: 'v4+26.05.19-1.16.1',
  name: 'MCSR Ranked for 1.16.1',
  files: sampleFiles,
  dependencies: { 'fabric-loader': '0.19.2', minecraft: '1.16.1' }
}

describe('parseIndex', () => {
  it('accepts a valid index', () => {
    expect(parseIndex(sampleIndex).versionId).toBe('v4+26.05.19-1.16.1')
  })
  it('rejects non-minecraft json', () => {
    expect(() => parseIndex({ game: 'other', files: [] })).toThrow()
  })
})

describe('filterMods', () => {
  it('keeps everything when no prefixes excluded', () => {
    expect(filterMods(sampleFiles, [])).toHaveLength(4)
  })
  it('drops ranked-only jars for RSG', () => {
    const out = filterMods(sampleFiles, RSG_EXCLUDE_PREFIXES)
    const names = out.map((f) => f.path)
    expect(names).not.toContain('mods/mcsrranked-5.7.12.jar')
    expect(names).not.toContain('mods/mcsrfairplay-1.2.1+1.16.1.jar')
    expect(names).toContain('mods/seedqueue-1.7.1+1.16.1.jar')
    expect(names).toContain('mods/sodium-2.5.1+1.16.1.jar')
    expect(out).toHaveLength(2)
  })
})

describe('verifyBuffer', () => {
  const buf = Buffer.from('hello world')
  it('passes a correct sha512', () => {
    const sha512 = createHash('sha512').update(buf).digest('hex')
    expect(() => verifyBuffer(buf, { sha512 })).not.toThrow()
  })
  it('throws on a wrong sha512', () => {
    expect(() => verifyBuffer(buf, { sha512: 'deadbeef' })).toThrow('sha512 mismatch')
  })
  it('falls back to sha1', () => {
    const sha1 = createHash('sha1').update(buf).digest('hex')
    expect(() => verifyBuffer(buf, { sha1 })).not.toThrow()
  })
})

describe('fabricVersionString', () => {
  it('builds the gmll fabric version id', () => {
    expect(fabricVersionString(sampleIndex)).toBe('fabric-loader-0.19.2-1.16.1')
  })
})
