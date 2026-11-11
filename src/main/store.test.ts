import { beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fixture = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ safeStorage: {} }))
vi.mock('./paths', () => ({ paths: { configFile: () => join(fixture.root, 'config.json') } }))

beforeEach(() => {
  vi.resetModules()
  fixture.root = mkdtempSync(join(tmpdir(), 'instance-config-'))
})

it('merges single-instance edits without resetting other RAM, Java, or map settings', async () => {
  const { store } = await import('./store')
  store.setConfig({ ram: { ranked: 4096, rsg: 6144 }, java: { ranked: 'C:/ranked/javaw.exe', zsg: 'C:/zsg/javaw.exe' }, maps: { rsg: [] } })
  const result = store.setConfig({ ram: { zsg: 8192 }, java: { ranked: null }, maps: { ranked: [] } })
  expect(result.ram).toEqual({ ranked: 4096, rsg: 6144, zsg: 8192 })
  expect(result.java).toEqual({ ranked: null, rsg: null, zsg: 'C:/zsg/javaw.exe' })
  expect(result.maps.ranked).toEqual([])
  expect(result.maps.rsg).toEqual([])
  expect(result.maps.zsg.length).toBeGreaterThan(0)
  vi.resetModules()
  expect((await import('./store')).store.getConfig()).toEqual(result)
})
