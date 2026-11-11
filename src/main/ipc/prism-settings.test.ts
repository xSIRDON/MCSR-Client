import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { INSTANCE_IDS, type InstanceId } from '../../shared/types'

const mock = vi.hoisted(() => ({ root: '', installed: new Set<string>(), ram: { ranked: 3072, rsg: 4096, zsg: 6144 }, states: Object.fromEntries(['ranked', 'rsg', 'zsg'].map(id => [id, { state: 'ready' }])) }))
vi.mock('../paths', () => ({ paths: { root: () => mock.root } }))
vi.mock('../store', () => ({ store: { getConfig: () => ({ ram: mock.ram }) } }))
vi.mock('../log', () => ({ logFailure: vi.fn() }))
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  execFileSync: vi.fn(() => '"prismlauncher.exe","1","Console","1","10 K"')
}))
vi.mock('../launcher/gmll-adapter', () => ({
  gameDir: (id: string) => join(mock.root, 'games', id),
  prismJvm: vi.fn(async (id: string) => ({ java: `C:/Java/${id}/javaw.exe`, args: ['-XX:+UseG1GC'] }))
}))
vi.mock('./instance-state', () => ({
  BUSY_STATES: ['installing', 'launching', 'running'], states: mock.states,
  installedVersion: (id: string) => mock.installed.has(id) ? 'old-pack' : undefined
}))
vi.mock('./pack-index', () => ({ getIndex: async () => ({ dependencies: { minecraft: '1.16.1', 'fabric-loader': '0.19.2' } }) }))
import { prismRoot, syncInstalledPrism, syncPrismInstance } from './prism-settings'
import { detachPrismInstance } from '../launcher/prism-instance'
import * as gmll from '../launcher/gmll-adapter'

beforeEach(() => {
  mock.root = mkdtempSync(join(tmpdir(), 'prism-migration-'))
  mock.installed = new Set(INSTANCE_IDS)
  mock.ram = { ranked: 3072, rsg: 4096, zsg: 6144 }
  for (const id of INSTANCE_IDS) {
    mock.states[id].state = 'ready'
    mkdirSync(join(mock.root, 'games', id), { recursive: true })
    writeFileSync(join(mock.root, 'games', id, 'options.txt'), id + ' settings')
  }
})
const profile = (id: InstanceId) => join(prismRoot(id), 'instances', id)

describe('installed instance migration and settings', () => {
  it('adopts Ranked, RSG and ZSG with separate RAM/Java and the original settings files', async () => {
    await syncInstalledPrism()
    for (const id of INSTANCE_IDS) {
      expect(realpathSync(join(profile(id), '.minecraft'))).toBe(realpathSync(gmll.gameDir(id)))
      expect(readFileSync(join(profile(id), '.minecraft', 'options.txt'), 'utf8')).toBe(id + ' settings')
      const cfg = readFileSync(join(profile(id), 'instance.cfg'), 'utf8')
      expect(cfg).toContain(`MaxMemAlloc=${mock.ram[id]}`)
      expect(cfg).toContain(`JavaPath=C:/Java/${id}/javaw.exe`)
    }
    mock.ram.rsg = 8192
    await syncPrismInstance('rsg')
    expect(readFileSync(join(profile('rsg'), 'instance.cfg'), 'utf8')).toContain('MaxMemAlloc=8192')
    expect(readFileSync(join(profile('zsg'), 'instance.cfg'), 'utf8')).toContain('MaxMemAlloc=6144')
  })

  it('does not create missing instances or touch a running profile', async () => {
    mock.installed.delete('zsg')
    mkdirSync(prismRoot('rsg'), { recursive: true })
    writeFileSync(join(prismRoot('rsg'), 'session.lock'), String(process.pid))
    await syncInstalledPrism()
    expect(existsSync(profile('ranked'))).toBe(true)
    expect(existsSync(profile('rsg'))).toBe(false)
    expect(existsSync(profile('zsg'))).toBe(false)
  })

  it('rechecks state after asynchronous Java resolution', async () => {
    vi.mocked(gmll.prismJvm).mockImplementationOnce(async () => {
      mock.states.ranked.state = 'launching'
      return { java: 'javaw', args: [], label: 'test' }
    })
    await syncPrismInstance('ranked')
    expect(existsSync(profile('ranked'))).toBe(false)
  })

  it('detaches a managed instance without deleting its game files and can adopt it again', async () => {
    await syncPrismInstance('rsg')
    detachPrismInstance(prismRoot('rsg'), 'rsg', gmll.gameDir('rsg'))
    expect(existsSync(join(profile('rsg'), '.minecraft'))).toBe(false)
    expect(readFileSync(join(gmll.gameDir('rsg'), 'options.txt'), 'utf8')).toBe('rsg settings')
    await syncPrismInstance('rsg')
    expect(existsSync(join(profile('rsg'), '.minecraft'))).toBe(true)
  })
})
