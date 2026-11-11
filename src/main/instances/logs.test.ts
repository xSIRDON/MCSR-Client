import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { cleanLogs, deleteLog, hideUser, listLogs, readLog, trimLog, uploadLog } from './logs'

function game(): string {
  const dir = mkdtempSync(join(tmpdir(), 'logs-'))
  mkdirSync(join(dir, 'logs'))
  mkdirSync(join(dir, 'crash-reports'))
  return dir
}

describe('listLogs', () => {
  it('lists logs and crash reports, latest.log first, then newest', () => {
    const dir = game()
    writeFileSync(join(dir, 'logs', '2026-06-26-1.log.gz'), gzipSync('old'))
    writeFileSync(join(dir, 'logs', 'latest.log'), 'now')
    writeFileSync(join(dir, 'logs', 'notes.json'), '{}')
    writeFileSync(join(dir, 'crash-reports', 'crash-2026-11-01_10.00.00-client.txt'), 'boom')
    utimesSync(join(dir, 'logs', '2026-06-26-1.log.gz'), 1000, 1000)
    utimesSync(join(dir, 'logs', 'latest.log'), 2000, 2000)
    utimesSync(join(dir, 'crash-reports', 'crash-2026-11-01_10.00.00-client.txt'), 3000, 3000)
    expect(listLogs(dir).map((l) => `${l.kind}:${l.name}`)).toEqual([
      'log:latest.log',
      'crash:crash-2026-11-01_10.00.00-client.txt',
      'log:2026-06-26-1.log.gz'
    ])
  })

  it('is empty when the instance has never run', () => {
    expect(listLogs(mkdtempSync(join(tmpdir(), 'logs-')))).toEqual([])
  })
})

describe('readLog', () => {
  it('reads gzipped logs and hides tokens and the Windows user', async () => {
    const dir = game()
    const text = 'token abc123\nLoading C:\\Users\\steve\\AppData\\Roaming\\x\n'
    writeFileSync(join(dir, 'logs', 'a.log.gz'), gzipSync(text))
    const out = await readLog(dir, 'log', 'a.log.gz', ['abc123'])
    expect(out).not.toContain('abc123')
    expect(out).toContain('C:\\Users\\user\\AppData')
  })

  it('refuses names that leave the log folder', async () => {
    const dir = game()
    await expect(readLog(dir, 'log', '../options.txt', [])).rejects.toThrow('Unknown log file.')
    await expect(readLog(dir, 'log', 'a/b.log', [])).rejects.toThrow('Unknown log file.')
  })
})

describe('deleting', () => {
  it('removes one file, and refuses names outside the log folders', async () => {
    const dir = game()
    writeFileSync(join(dir, 'logs', 'a.log'), 'a')
    writeFileSync(join(dir, 'options.txt'), 'keep')
    await deleteLog(dir, 'log', 'a.log')
    expect(listLogs(dir)).toEqual([])
    await expect(deleteLog(dir, 'log', '../options.txt')).rejects.toThrow('Unknown log file.')
  })

  it('clean keeps latest.log and removes the rest', async () => {
    const dir = game()
    writeFileSync(join(dir, 'logs', 'latest.log'), 'now')
    writeFileSync(join(dir, 'logs', '2026-06-26-1.log.gz'), gzipSync('old'))
    writeFileSync(join(dir, 'crash-reports', 'crash-1.txt'), 'boom')
    expect(await cleanLogs(dir)).toBe(2)
    expect(listLogs(dir).map((l) => l.name)).toEqual(['latest.log'])
  })
})

describe('size limits', () => {
  it('refuses a gzip that inflates past 64MB', async () => {
    const dir = game()
    writeFileSync(join(dir, 'logs', 'bomb.log.gz'), gzipSync(Buffer.alloc(80 * 1024 * 1024)))
    await expect(readLog(dir, 'log', 'bomb.log.gz', [])).rejects.toThrow()
  })
})

describe('trimLog', () => {
  it('keeps the last 25000 lines', () => {
    const text = Array.from({ length: 25_010 }, (_, i) => `line ${i}`).join('\n')
    const out = trimLog(text).split('\n')
    expect(out).toHaveLength(25_000)
    expect(out[0]).toBe('line 10')
    expect(out[out.length - 1]).toBe('line 25009')
  })
})

describe('hideUser', () => {
  it('covers forward slashes and unix homes', () => {
    expect(hideUser('C:/Users/steve/x /home/alex/.minecraft')).toBe('C:/Users/user/x /home/user/.minecraft')
  })
})

describe('uploadLog', () => {
  it('posts the log and returns the url', async () => {
    let sent: unknown
    const post = (async (_url: unknown, init?: { body?: unknown }) => {
      sent = JSON.parse(String(init?.body))
      return { status: 200, json: async () => ({ success: true, url: 'https://mclo.gs/abc' }) }
    }) as unknown as typeof fetch
    expect(await uploadLog('hello', post)).toBe('https://mclo.gs/abc')
    expect(sent).toEqual({ content: 'hello', source: 'MCSR Client' })
  })

  it('passes on the service error', async () => {
    const post = (async () => ({ status: 400, json: async () => ({ success: false, error: 'too big' }) })) as unknown as typeof fetch
    await expect(uploadLog('x', post)).rejects.toThrow('too big')
  })
})
