import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('main process preload reference', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8')

  it('loads the .mjs preload build, not a non-existent .js', () => {
    expect(src).toContain('../preload/index.mjs')
    expect(src).not.toContain('../preload/index.js')
  })
})
