import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Regression guard for a silent, high-impact bug.
//
// With "type": "module" in package.json, electron-vite emits the preload bundle
// as out/preload/index.mjs (ESM). The main process must load that exact file.
// A stale "../preload/index.js" reference points at a file that does not exist;
// Electron then fails to inject the preload *without throwing*, leaving
// window.obsidian undefined so every renderer->main call dies with
// "Cannot read properties of undefined (reading 'auth')".
describe('main process preload reference', () => {
  // Resolve relative to this test file so it doesn't depend on the working directory.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8')

  it('loads the .mjs preload build, not a non-existent .js', () => {
    expect(src).toContain('../preload/index.mjs')
    expect(src).not.toContain('../preload/index.js')
  })
})
