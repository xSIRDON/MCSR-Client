import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tasklist = vi.hoisted(() => ({ out: '' }))
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  execFileSync: vi.fn(() => tasklist.out)
}))

import { prismSessionActive } from './prism-instance'

function lockedRoot(pid: number): string {
  const root = mkdtempSync(join(tmpdir(), 'prism-lock-'))
  writeFileSync(join(root, 'session.lock'), String(pid))
  return root
}

describe.runIf(process.platform === 'win32')('prism session lock', () => {
  it('is active while that pid is still prism', () => {
    tasklist.out = '"prismlauncher.exe","4242","Console","1","80,000 K"'
    expect(prismSessionActive(lockedRoot(4242))).toBe(true)
  })

  it('is stale once the pid belongs to something else, like after a reboot', () => {
    tasklist.out = '"chrome.exe","4242","Console","1","80,000 K"'
    expect(prismSessionActive(lockedRoot(4242))).toBe(false)
  })

  it('is stale when nothing has that pid', () => {
    tasklist.out = 'INFO: No tasks are running which match the specified criteria.'
    expect(prismSessionActive(lockedRoot(4242))).toBe(false)
  })
})

describe('prism session lock', () => {
  it('ignores a missing or garbage lock', () => {
    expect(prismSessionActive(mkdtempSync(join(tmpdir(), 'prism-lock-')))).toBe(false)
    expect(prismSessionActive(lockedRoot(-1))).toBe(false)
  })
})
