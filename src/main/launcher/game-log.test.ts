import { expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gameLogReader } from './game-log'

it('skips previous-session output and follows log rotation', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'game-log-')), 'latest.log')
  writeFileSync(file, 'previous session\n')
  const chunks: string[] = []
  const poll = gameLogReader(file, Date.now() + 1000, (text) => chunks.push(text))
  poll()
  expect(chunks).toEqual([])
  appendFileSync(file, 'new output\n')
  poll()
  expect(chunks.join('')).toBe('new output\n')
  renameSync(file, `${file}.old`)
  writeFileSync(file, 'rotated\n')
  poll()
  expect(chunks.join('')).toBe('new output\nrotated\n')
})
