import { describe, it, expect } from 'vitest'
import { gameWindowReady } from './game-ready'

describe('gameWindowReady', () => {
  it('matches real 1.16.1 window/render startup lines (case-insensitive)', () => {
    expect(gameWindowReady('[Render thread/INFO]: LWJGL Version: 3.2.2 build 10')).toBe(true)
    expect(gameWindowReady('[Render thread/INFO]: OpenAL initialized.')).toBe(true)
    expect(gameWindowReady('[Render thread/INFO]: Sound engine started')).toBe(true)
    expect(gameWindowReady('[Render thread/INFO]: Setting user: TheTusi')).toBe(true)
    expect(gameWindowReady('Narrator library for x64 successfully loaded')).toBe(true)
  })

  it('does not fire on early JVM/mod-loader output (before the window exists)', () => {
    expect(gameWindowReady('[main/INFO]: Loading Minecraft 1.16.1 with Fabric Loader 0.19.3')).toBe(false)
    expect(gameWindowReady('[main/INFO]: Loading 45 mods:')).toBe(false)
    expect(gameWindowReady('Downloading assets (120/900)')).toBe(false)
    expect(gameWindowReady('')).toBe(false)
  })

  it('matches when the marker is embedded in a larger multi-line chunk', () => {
    const chunk = 'foo\n[Render thread/INFO]: OpenAL initialized.\nbar'
    expect(gameWindowReady(chunk)).toBe(true)
  })
})
