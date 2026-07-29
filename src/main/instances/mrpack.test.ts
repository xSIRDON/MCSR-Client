import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseIndex,
  filterMods,
  verifyBuffer,
  safeJoin,
  fabricVersionString,
  assertTrustedDownloadUrl,
  installPackFiles,
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


describe('safeJoin (pack path containment)', () => {
  const root = process.platform === 'win32' ? String.raw`C:\game` : '/game'

  it('resolves ordinary pack paths inside the game dir', () => {
    expect(safeJoin(root, 'mods/sodium.jar')).toContain('sodium.jar')
    expect(safeJoin(root, 'config/mcsr/seedqueue.json')).toContain('seedqueue.json')
  })

  it('refuses paths that escape the game dir', () => {
    expect(() => safeJoin(root, '../evil.bat')).toThrow(/out-of-bounds/)
    expect(() =>
      safeJoin(root, '../../../../AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/x.bat')
    ).toThrow(/out-of-bounds/)
  })

  it('refuses absolute paths and the root itself', () => {
    const abs =
      process.platform === 'win32' ? String.raw`C:\Windows\system32\evil.dll` : '/etc/passwd'
    expect(() => safeJoin(root, abs)).toThrow(/out-of-bounds/)
    expect(() => safeJoin(root, '')).toThrow(/out-of-bounds/)
  })
})

describe('verifyBuffer fails closed', () => {
  it('rejects a file that carries no hash at all', () => {
    expect(() => verifyBuffer(Buffer.from('anything'), {})).toThrow(/no hash/)
  })
})

describe('assertTrustedDownloadUrl', () => {
  it('accepts the hosts the pack actually uses', () => {
    expect(() =>
      assertTrustedDownloadUrl('https://cdn.modrinth.com/data/x/versions/y/sodium.jar')
    ).not.toThrow()
    expect(() =>
      assertTrustedDownloadUrl('https://redlime.github.io/MCSRMods/modpacks/v4/pack.mrpack')
    ).not.toThrow()
    expect(() => assertTrustedDownloadUrl('https://api.modrinth.com/v2/project/x')).not.toThrow()
  })

  it('refuses plain http even on a trusted host', () => {
    expect(() => assertTrustedDownloadUrl('http://cdn.modrinth.com/x.jar')).toThrow(/untrusted/i)
  })

  it('refuses unknown hosts, lookalikes, and garbage', () => {
    expect(() => assertTrustedDownloadUrl('https://evil.example/x.jar')).toThrow(/untrusted/i)
    expect(() => assertTrustedDownloadUrl('https://cdn.modrinth.com.evil.example/x.jar')).toThrow(
      /untrusted/i
    )
    expect(() => assertTrustedDownloadUrl('not a url')).toThrow(/malformed/i)
    expect(() => assertTrustedDownloadUrl('file:///C:/x.jar')).toThrow(/untrusted/i)
  })
})

describe('installPackFiles URL containment', () => {
  function indexWith(files: PackFile[]): ModrinthIndex {
    return { ...sampleIndex, files }
  }

  it('never fetches an untrusted mirror and succeeds via the trusted one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcsr-test-'))
    const body = Buffer.from('jar-bytes')
    const sha512 = createHash('sha512').update(body).digest('hex')
    const fetched: string[] = []
    try {
      await installPackFiles(
        indexWith([
          {
            path: 'mods/a.jar',
            hashes: { sha512 },
            downloads: ['https://evil.example/a.jar', 'https://cdn.modrinth.com/data/a.jar']
          }
        ]),
        dir,
        {
          fetchBuffer: async (url) => {
            fetched.push(url)
            return body
          }
        }
      )
      expect(fetched).toEqual(['https://cdn.modrinth.com/data/a.jar'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails the install when every mirror is untrusted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcsr-test-'))
    try {
      await expect(
        installPackFiles(
          indexWith([
            { path: 'mods/a.jar', hashes: { sha512: 'ab' }, downloads: ['http://cdn.modrinth.com/a.jar'] }
          ]),
          dir,
          { fetchBuffer: async () => Buffer.from('x') }
        )
      ).rejects.toThrow(/untrusted/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
