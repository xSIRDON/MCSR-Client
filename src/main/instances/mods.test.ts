import { describe, it, expect, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseModFilename,
  listMods,
  setModEnabled,
  installModJar,
  hasExtraOptions,
  shouldPromptExtraOptions,
  pruneSupersededMods,
  upgradeInstalledMods
} from './mods'

describe('parseModFilename', () => {
  it('splits name and version at the first digit-led separator', () => {
    expect(parseModFilename('mcsrranked-5.7.12+1.16.1.jar')).toEqual({
      name: 'mcsrranked',
      version: '5.7.12+1.16.1'
    })
    expect(parseModFilename('fabric-loader-0.19.2.jar')).toEqual({
      name: 'fabric-loader',
      version: '0.19.2'
    })
    expect(parseModFilename('sodium-2.5.1.jar')).toEqual({ name: 'sodium', version: '2.5.1' })
  })

  it('handles a disabled suffix and a versionless name', () => {
    expect(parseModFilename('seedqueue-1.7.1.jar.disabled')).toEqual({
      name: 'seedqueue',
      version: '1.7.1'
    })
    expect(parseModFilename('lazydfu.jar')).toEqual({ name: 'lazydfu', version: '' })
  })
})

describe('listMods + setModEnabled', () => {
  const made: string[] = []
  function tmpMods(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
    made.push(d)
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  })

  it('lists enabled and disabled jars, ignoring non-jars', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sodium-2.5.1.jar'), '')
    writeFileSync(join(dir, 'atum-2.7.2.jar.disabled'), '')
    writeFileSync(join(dir, 'notes.txt'), '')

    const mods = listMods(dir)
    expect(mods).toHaveLength(2)
    expect(mods.find((m) => m.name === 'sodium')?.enabled).toBe(true)
    expect(mods.find((m) => m.name === 'atum')?.enabled).toBe(false)
    expect(mods.find((m) => m.name === 'atum')?.file).toBe('atum-2.7.2.jar')
  })

  it('toggles a mod off and back on', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'krypton-0.2.0.jar'), '')

    setModEnabled(dir, 'krypton-0.2.0.jar', false)
    expect(existsSync(join(dir, 'krypton-0.2.0.jar'))).toBe(false)
    expect(existsSync(join(dir, 'krypton-0.2.0.jar.disabled'))).toBe(true)
    expect(listMods(dir)[0].enabled).toBe(false)

    setModEnabled(dir, 'krypton-0.2.0.jar', true)
    expect(existsSync(join(dir, 'krypton-0.2.0.jar'))).toBe(true)
    expect(listMods(dir)[0].enabled).toBe(true)
  })

  it('returns an empty list when the folder is absent', () => {
    expect(listMods(join(tmpdir(), 'definitely-not-here-xyz'))).toEqual([])
  })
})

describe('installModJar', () => {
  const made: string[] = []
  function tmpMods(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
    made.push(d)
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  })

  const body = Buffer.from('fake-jar-bytes')
  const sha512 = createHash('sha512').update(body).digest('hex')

  it('downloads, verifies sha512, and writes the jar', async () => {
    const dir = tmpMods()
    const wrote = await installModJar(
      dir,
      { file: 'x-1.0.jar', urls: ['https://a/x.jar'], sha512 },
      async () => body
    )
    expect(wrote).toBe(true)
    expect(existsSync(join(dir, 'x-1.0.jar'))).toBe(true)
  })

  it('is idempotent when the jar exists and never fetches', async () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'x-1.0.jar'), '')
    let calls = 0
    const wrote = await installModJar(dir, { file: 'x-1.0.jar', urls: ['https://a/x.jar'] }, async () => {
      calls++
      return body
    })
    expect(wrote).toBe(false)
    expect(calls).toBe(0)
  })

  it('skips when a .disabled twin exists', async () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'x-1.0.jar.disabled'), '')
    const wrote = await installModJar(dir, { file: 'x-1.0.jar', urls: ['https://a/x.jar'] }, async () => body)
    expect(wrote).toBe(false)
    expect(existsSync(join(dir, 'x-1.0.jar'))).toBe(false)
  })

  it('rejects a hash mismatch and writes nothing', async () => {
    const dir = tmpMods()
    await expect(
      installModJar(dir, { file: 'x-1.0.jar', urls: ['https://a/x.jar'], sha512: 'deadbeef' }, async () => body)
    ).rejects.toThrow()
    expect(existsSync(join(dir, 'x-1.0.jar'))).toBe(false)
  })

  it('falls through to the next url when the first fails', async () => {
    const dir = tmpMods()
    const fetchBuffer = async (url: string) => {
      if (url.includes('good')) return body
      throw new Error('boom')
    }
    const wrote = await installModJar(
      dir,
      { file: 'x-1.0.jar', urls: ['https://bad/x.jar', 'https://good/x.jar'], sha512 },
      fetchBuffer
    )
    expect(wrote).toBe(true)
    expect(existsSync(join(dir, 'x-1.0.jar'))).toBe(true)
  })
})

describe('hasExtraOptions', () => {
  const made: string[] = []
  function tmpMods(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
    made.push(d)
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  })

  it('detects an enabled extra-options jar', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'extra-options-2.2.1+1.16.1.jar'), '')
    expect(hasExtraOptions(dir)).toBe(true)
  })

  it('detects a parked .disabled extra-options jar', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'extra-options-2.2.1+1.16.1.jar.disabled'), '')
    expect(hasExtraOptions(dir)).toBe(true)
  })

  it('is false when no extra-options jar is present', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sodium-2.5.1.jar'), '')
    expect(hasExtraOptions(dir)).toBe(false)
  })
})

describe('shouldPromptExtraOptions', () => {
  it('does not show once the prompt has been seen', () => {
    expect(
      shouldPromptExtraOptions(true, [{ id: 'rsg', ready: true, hasExtraOptions: false }])
    ).toEqual({ show: false, instances: [] })
  })

  it('shows for installed instances missing extra-options', () => {
    expect(
      shouldPromptExtraOptions(false, [
        { id: 'rsg', ready: true, hasExtraOptions: false },
        { id: 'zsg', ready: true, hasExtraOptions: true }
      ])
    ).toEqual({ show: true, instances: ['rsg'] })
  })

  it('ignores instances that are not installed', () => {
    expect(
      shouldPromptExtraOptions(false, [{ id: 'rsg', ready: false, hasExtraOptions: false }])
    ).toEqual({ show: false, instances: [] })
  })

  it('does not show when every installed instance already has it', () => {
    expect(
      shouldPromptExtraOptions(false, [
        { id: 'rsg', ready: true, hasExtraOptions: true },
        { id: 'zsg', ready: true, hasExtraOptions: true }
      ])
    ).toEqual({ show: false, instances: [] })
  })
})


describe('setModEnabled rejects non-basename files', () => {
  const made: string[] = []
  function tmpMods(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
    made.push(d)
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  })

  it('refuses a traversing path instead of renaming outside mods/', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    const outside = join(dir, '..', 'victim.txt')
    writeFileSync(outside, 'important')

    expect(() => setModEnabled(dir, '../victim.txt', false)).toThrow(/Invalid mod file/)
    expect(existsSync(outside)).toBe(true)
    expect(existsSync(outside + '.disabled')).toBe(false)
  })

  it('refuses non-jar names', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    expect(() => setModEnabled(dir, 'notes.txt', false)).toThrow(/Invalid mod file/)
  })

  it('still toggles an ordinary jar basename', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sodium-2.5.1.jar'), '')
    setModEnabled(dir, 'sodium-2.5.1.jar', false)
    expect(existsSync(join(dir, 'sodium-2.5.1.jar.disabled'))).toBe(true)
  })
})

describe('pruneSupersededMods', () => {
  const made: string[] = []
  function tmpMods(files: string[]): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
    made.push(d)
    for (const f of files) writeFileSync(join(d, f), '')
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('removes older versions of freshly installed mods, parked copies included', () => {
    const dir = tmpMods([
      'hermes-0.12.5+MC1.16.1.jar',
      'hermes-0.15.1+MC1.16.1.jar',
      'seedqueue-1.7.0+1.16.1.jar.disabled',
      'seedqueue-1.7.1+1.16.1.jar'
    ])
    const removed = pruneSupersededMods(dir, ['hermes-0.15.1+MC1.16.1.jar', 'seedqueue-1.7.1+1.16.1.jar'])
    expect(removed.sort()).toEqual(['hermes-0.12.5+MC1.16.1.jar', 'seedqueue-1.7.0+1.16.1.jar.disabled'])
    expect(readdirSync(dir).sort()).toEqual(['hermes-0.15.1+MC1.16.1.jar', 'seedqueue-1.7.1+1.16.1.jar'])
  })

  it('leaves mods the pack did not install, even with similar names', () => {
    const dir = tmpMods([
      'hermes-0.15.1+MC1.16.1.jar',
      'hermes-core-0.3.2.jar',
      'extra-options-2.2.1+1.16.1.jar',
      'FSG-Mod-5.3.0+MC1.16.1.jar'
    ])
    expect(pruneSupersededMods(dir, ['hermes-0.15.1+MC1.16.1.jar'])).toEqual([])
    expect(readdirSync(dir)).toHaveLength(4)
  })

  it('keeps a parked copy of the exact version just installed', () => {
    const dir = tmpMods(['sodium-2.5.1+1.16.1.jar.disabled'])
    expect(pruneSupersededMods(dir, ['sodium-2.5.1+1.16.1.jar'])).toEqual([])
  })
})

describe('upgradeInstalledMods', () => {
  const made: string[] = []
  function tmpMods(files: string[]): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
    made.push(d)
    for (const f of files) writeFileSync(join(d, f), 'old')
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  const body = Buffer.from('hermes-0.15.1')
  const upgrade = {
    replaces: 'mods/hermes-0.12.5+MC1.16.1.jar',
    path: 'mods/hermes-0.15.1+MC1.16.1.jar',
    urls: ['https://github.com/x/hermes-0.15.1+MC1.16.1.jar'],
    sha512: createHash('sha512').update(body).digest('hex')
  }

  it('replaces the superseded jar with the verified new build', async () => {
    const dir = tmpMods(['hermes-0.12.5+MC1.16.1.jar', 'sodium-2.5.1+1.16.1.jar'])
    expect(await upgradeInstalledMods(dir, [upgrade], async () => body)).toEqual(['hermes-0.15.1+MC1.16.1.jar'])
    expect(readdirSync(dir).sort()).toEqual(['hermes-0.15.1+MC1.16.1.jar', 'sodium-2.5.1+1.16.1.jar'])
    expect(readFileSync(join(dir, 'hermes-0.15.1+MC1.16.1.jar'), 'utf8')).toBe('hermes-0.15.1')
  })

  it('keeps a disabled mod disabled', async () => {
    const dir = tmpMods(['hermes-0.12.5+MC1.16.1.jar.disabled'])
    await upgradeInstalledMods(dir, [upgrade], async () => body)
    expect(readdirSync(dir)).toEqual(['hermes-0.15.1+MC1.16.1.jar.disabled'])
  })

  it('does nothing when the old jar is gone', async () => {
    const dir = tmpMods(['sodium-2.5.1+1.16.1.jar'])
    let calls = 0
    const done = await upgradeInstalledMods(dir, [upgrade], async () => {
      calls++
      return body
    })
    expect(done).toEqual([])
    expect(calls).toBe(0)
  })

  it('keeps the old jar when the download fails verification', async () => {
    const dir = tmpMods(['hermes-0.12.5+MC1.16.1.jar'])
    await expect(upgradeInstalledMods(dir, [upgrade], async () => Buffer.from('tampered'))).rejects.toThrow()
    expect(readdirSync(dir)).toEqual(['hermes-0.12.5+MC1.16.1.jar'])
  })

  it('refuses untrusted hosts before fetching', async () => {
    const dir = tmpMods(['hermes-0.12.5+MC1.16.1.jar'])
    let calls = 0
    await expect(
      upgradeInstalledMods(dir, [{ ...upgrade, urls: ['https://evil.example/hermes.jar'] }], async () => {
        calls++
        return body
      })
    ).rejects.toThrow()
    expect(calls).toBe(0)
  })
})
