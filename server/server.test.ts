import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = dirname(fileURLToPath(import.meta.url))

interface TestServer {
  base: string
  port: number
  stop: () => Promise<void>
}

/**
 * Spawn the real server against a throwaway SQLite file. DEV_ALLOW_UNVERIFIED=1 skips the
 * Mojang handshake so tests can mint arbitrary identities. One server per describe block:
 * the per-IP auth limiter (10/min from 127.0.0.1) would otherwise starve later suites.
 */
async function startServer(): Promise<TestServer> {
  const port = 20000 + Math.floor(Math.random() * 20000)
  const dir = mkdtempSync(join(tmpdir(), 'mcsr-friends-test-'))
  const child: ChildProcess = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      SERVER_SECRET: 'test-secret-not-production',
      DEV_ALLOW_UNVERIFIED: '1',
      DB_PATH: join(dir, 'friends.db'),
      PORT: String(port),
      BIND: '127.0.0.1'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let stderr = ''
  child.stderr?.on('data', (d) => (stderr += d))
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 15_000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${stderr}`)
    try {
      const res = await fetch(`${base}/v1/health`)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill()
      throw new Error(`server never became healthy: ${stderr}`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  return {
    base,
    port,
    stop: async () => {
      // Wait for the process to actually exit before removing its DB — on Windows an
      // rmSync while the file is still open fails with EPERM.
      const exited = new Promise<void>((r) => child.once('exit', () => r()))
      child.kill()
      await exited
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* leftover temp files are harmless */
      }
    }
  }
}

async function api(
  base: string,
  token: string | null,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

/** Handshake + verify (Mojang check disabled) -> bearer token. */
async function signIn(base: string, uuid: string, name: string): Promise<string> {
  const hs = await api(base, null, 'POST', '/v1/auth/handshake', { uuid })
  expect(hs.status).toBe(200)
  const vf = await api(base, null, 'POST', '/v1/auth/verify', {
    uuid,
    username: name,
    serverId: hs.json.serverId
  })
  expect(vf.status).toBe(200)
  return vf.json.token as string
}

const U = {
  alice: 'a'.repeat(32),
  bob: 'b'.repeat(32),
  carol: 'c'.repeat(32),
  dave: 'd'.repeat(32)
}

describe('identity is not writable by other users', () => {
  let s: TestServer
  beforeAll(async () => {
    s = await startServer()
  })
  afterAll(() => s.stop())

  it('a friend request cannot rename an existing verified user', async () => {
    const alice = await signIn(s.base, U.alice, 'RealAlice')
    const bob = await signIn(s.base, U.bob, 'Bob')
    const carol = await signIn(s.base, U.carol, 'Carol')

    // Bob and Alice become friends so Bob can see Alice's nickname.
    await api(s.base, bob, 'POST', '/v1/friends/requests', { to: U.alice, nickname: 'RealAlice' })
    await api(s.base, alice, 'POST', `/v1/friends/requests/${U.bob}/accept`)

    // Carol tries to rename Alice via the nickname field of a request.
    await api(s.base, carol, 'POST', '/v1/friends/requests', { to: U.alice, nickname: 'Hacked' })

    const list = await api(s.base, bob, 'GET', '/v1/friends')
    const aliceEntry = list.json.friends.find((f: any) => f.uuid === U.alice)
    expect(aliceEntry.nickname).toBe('RealAlice')
  })
})

describe('message visibility', () => {
  let s: TestServer
  beforeAll(async () => {
    s = await startServer()
  })
  afterAll(() => s.stop())

  it('messages flow between friends and stay invisible to third parties', async () => {
    const alice = await signIn(s.base, U.alice, 'Alice')
    const bob = await signIn(s.base, U.bob, 'Bob')
    const carol = await signIn(s.base, U.carol, 'Carol')

    await api(s.base, alice, 'POST', '/v1/friends/requests', { to: U.bob, nickname: '' })
    await api(s.base, bob, 'POST', `/v1/friends/requests/${U.alice}/accept`)

    const sent = await api(s.base, alice, 'POST', '/v1/messages', { to: U.bob, body: 'hello bob' })
    expect(sent.status).toBe(200)

    const bobView = await api(s.base, bob, 'GET', '/v1/messages?since=0')
    expect(bobView.json.messages.map((m: any) => m.body)).toContain('hello bob')

    const aliceView = await api(s.base, alice, 'GET', '/v1/messages?since=0')
    expect(aliceView.json.messages.map((m: any) => m.body)).toContain('hello bob')

    const carolView = await api(s.base, carol, 'GET', '/v1/messages?since=0')
    expect(carolView.json.messages).toHaveLength(0)

    // A non-friend cannot message either of them.
    const blocked = await api(s.base, carol, 'POST', '/v1/messages', { to: U.alice, body: 'spam' })
    expect(blocked.status).toBe(403)
  })
})

/**
 * POST raw bytes over a bare socket in two writes split at `splitAt`, so the server sees
 * the body in two chunks. This is the only way to force the chunk boundary that breaks
 * string-concatenated UTF-8 decoding.
 */
function rawSplitPost(
  port: number,
  path: string,
  token: string,
  bodyBuf: Buffer,
  splitAt: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = connect(port, '127.0.0.1')
    sock.setNoDelay(true)
    sock.resume() // discard the response; a paused socket never reaches 'close'
    const head =
      `POST ${path} HTTP/1.1\r\n` +
      `Host: 127.0.0.1\r\n` +
      `Authorization: Bearer ${token}\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${bodyBuf.length}\r\n` +
      `Connection: close\r\n\r\n`
    sock.on('error', reject)
    sock.on('close', () => resolve())
    sock.write(head)
    sock.write(bodyBuf.subarray(0, splitAt))
    setTimeout(() => sock.write(bodyBuf.subarray(splitAt)), 60)
  })
}

describe('request body decoding', () => {
  let s: TestServer
  beforeAll(async () => {
    s = await startServer()
  })
  afterAll(() => s.stop())

  it('survives a multi-byte character split across TCP chunks', async () => {
    const alice = await signIn(s.base, U.alice, 'Alice')
    const bob = await signIn(s.base, U.bob, 'Bob')
    await api(s.base, alice, 'POST', '/v1/friends/requests', { to: U.bob, nickname: '' })
    await api(s.base, bob, 'POST', `/v1/friends/requests/${U.alice}/accept`)

    const body = Buffer.from(JSON.stringify({ to: U.bob, body: 'héllo 😀 wörld' }), 'utf8')
    // Split inside the emoji: find its first byte (0xf0) and cut one byte after it.
    const emojiStart = body.indexOf(0xf0)
    expect(emojiStart).toBeGreaterThan(0)
    await rawSplitPost(s.port, '/v1/messages', alice, body, emojiStart + 1)

    const bobView = await api(s.base, bob, 'GET', '/v1/messages?since=0')
    expect(bobView.json.messages.map((m: any) => m.body)).toContain('héllo 😀 wörld')
  })
})

describe('friend-request rate limiting', () => {
  let s: TestServer
  beforeAll(async () => {
    s = await startServer()
  })
  afterAll(() => s.stop())

  it('cuts off a request flood at its own bucket, well under the generic 120/min', async () => {
    const alice = await signIn(s.base, U.alice, 'Alice')
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) {
      const uuid = i.toString(16).padStart(32, '0')
      const res = await api(s.base, alice, 'POST', '/v1/friends/requests', { to: uuid, nickname: '' })
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(204))
    expect(statuses[10]).toBe(429)
    expect(statuses[11]).toBe(429)
  })
})
