import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  describeJvm,
  jvmArgsFor,
  missingRuntimeFiles,
  pickGc,
  windowsBuildOf,
  withRam,
  type RuntimeManifest
} from './jvm'

const GMLL_G1 = [
  '-Xmx${ram}M',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+UseG1GC',
  '-XX:G1NewSizePercent=20',
  '-XX:G1ReservePercent=20',
  '-XX:MaxGCPauseMillis=50',
  '-XX:G1HeapRegionSize=32M',
  '-Dlog4j2.formatMsgNoLookups=true'
]

describe('windowsBuildOf', () => {
  it('reads the build from os.release()', () => {
    expect(windowsBuildOf('10.0.26200')).toBe(26200)
    expect(windowsBuildOf('10.0.17134')).toBe(17134)
  })
  it('returns null for non-NT strings', () => {
    expect(windowsBuildOf('')).toBeNull()
    expect(windowsBuildOf('garbage')).toBeNull()
  })
})

describe('pickGc', () => {
  it('uses ZGC on Java 17+ on a modern Windows build', () => {
    expect(pickGc(17, 'win32', 19045)).toBe('zgc')
    expect(pickGc(21, 'win32', 26200)).toBe('zgc')
    expect(pickGc(23, 'win32', 22631)).toBe('zgc')
    expect(pickGc(25, 'win32', 26200)).toBe('zgc')
  })
  it('keeps G1 below Java 17 or when the version is unknown', () => {
    expect(pickGc(8, 'win32', 26200)).toBe('g1')
    expect(pickGc(16, 'win32', 26200)).toBe('g1')
    expect(pickGc(null, 'win32', 26200)).toBe('g1')
  })
  it('keeps G1 on Windows builds older than 1803', () => {
    expect(pickGc(21, 'win32', 16299)).toBe('g1')
    expect(pickGc(21, 'win32', null)).toBe('g1')
  })
  it('ignores the Windows build elsewhere', () => {
    expect(pickGc(21, 'linux', null)).toBe('zgc')
  })
})

describe('jvmArgsFor', () => {
  it('returns GMLL’s stock list untouched for G1', () => {
    expect(jvmArgsFor('g1', 21, GMLL_G1)).toEqual(GMLL_G1)
  })

  it('uses the tech-support flag set for ZGC, never mixing collectors', () => {
    expect(jvmArgsFor('zgc', 21, GMLL_G1)).toEqual([
      '-Xmx${ram}M',
      '-XX:+UseZGC',
      '-XX:+AlwaysPreTouch',
      '-XX:NmethodSweepActivity=1',
      '-Djdk.graal.TuneInlinerExploration=1',
      '-Dlog4j2.formatMsgNoLookups=true'
    ])
    expect(jvmArgsFor('zgc', 21, GMLL_G1).some((a) => a.includes('G1'))).toBe(false)
  })

  it('turns generational ZGC back off only on Java 23', () => {
    expect(jvmArgsFor('zgc', 23, GMLL_G1)).toContain('-XX:-ZGenerational')
    expect(jvmArgsFor('zgc', 21, GMLL_G1)).not.toContain('-XX:-ZGenerational')
    expect(jvmArgsFor('zgc', 24, GMLL_G1)).not.toContain('-XX:-ZGenerational')
  })
})

describe('withRam', () => {
  it('fills the ${ram} placeholder', () => {
    expect(withRam(['-Xmx${ram}M', '-XX:+UseZGC'], 10240)).toEqual(['-Xmx10240M', '-XX:+UseZGC'])
  })
})

describe('describeJvm', () => {
  it('labels the runtime and collector', () => {
    expect(describeJvm(21, false, 'zgc')).toBe('Java 21 (bundled) · ZGC')
    expect(describeJvm(8, false, 'g1')).toBe('Java 8 (bundled) · G1')
    expect(describeJvm(null, true, 'g1')).toBe('Java (custom) · G1')
  })
})

describe('missingRuntimeFiles', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcsr-jvm-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const manifest: RuntimeManifest = {
    files: {
      bin: { type: 'directory' },
      'bin/javaw.exe': { type: 'file', downloads: { raw: { size: 4 } } },
      'lib/modules': { type: 'file', downloads: { raw: { size: 3 } } }
    }
  }

  it('reports nothing when every file is present at its size', () => {
    mkdirSync(join(dir, 'bin'))
    mkdirSync(join(dir, 'lib'))
    writeFileSync(join(dir, 'bin', 'javaw.exe'), 'java')
    writeFileSync(join(dir, 'lib', 'modules'), 'abc')
    expect(missingRuntimeFiles(manifest, dir)).toEqual([])
  })

  it('flags missing and truncated files', () => {
    mkdirSync(join(dir, 'bin'))
    writeFileSync(join(dir, 'bin', 'javaw.exe'), 'ja')
    expect(missingRuntimeFiles(manifest, dir).sort()).toEqual(['bin/javaw.exe', 'lib/modules'])
  })
})
