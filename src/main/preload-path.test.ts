import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('preload', () => {
  const main = readFileSync(join(here, 'index.ts'), 'utf8')
  const config = readFileSync(join(here, '..', '..', 'electron.vite.config.ts'), 'utf8')

  it('main loads the .cjs preload that the build writes', () => {
    expect(main).toContain('../preload/index.cjs')
    expect(config).toContain("entryFileNames: '[name].cjs'")
  })

  it('renderer runs sandboxed with context isolation', () => {
    expect(main).toContain('sandbox: true')
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
  })
})
