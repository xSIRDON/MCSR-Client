// MCSR Client friends & presence backend.
// Zero dependencies: node:http + node:sqlite (Node 22.13+). One file on purpose —
// small enough to audit in one sitting, cheap enough to run anywhere.
//
// Identity is the player's Minecraft account, proven with the same handshake real
// Minecraft servers use: the client calls Mojang's joinServer with a nonce we issue,
// we confirm it via hasJoined. No passwords, no OAuth app, nothing to leak.
//
// Env:
//   SERVER_SECRET  (required)  HMAC key for session tokens. Generate once, keep private.
//   PORT           (default 8787)
//   DB_PATH        (default ./friends.db)
//   DEV_ALLOW_UNVERIFIED=1     Skip Mojang verification — LOCAL TESTING ONLY.

import { createServer } from 'node:http'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const SECRET = process.env.SERVER_SECRET
const DEV_UNVERIFIED = process.env.DEV_ALLOW_UNVERIFIED === '1'
if (!SECRET) {
  console.error('SERVER_SECRET is required (any long random string).')
  process.exit(1)
}
if (DEV_UNVERIFIED) console.warn('!! DEV_ALLOW_UNVERIFIED is ON — identity checks are OFF. Never run like this in production.')

const PORT = Number(process.env.PORT ?? 8787)
const TOKEN_TTL_S = 30 * 24 * 3600 // 30 days
const OFFLINE_AFTER_S = 3 * 60 // 3 missed minutes of heartbeats = offline

// ---- storage ----------------------------------------------------------------

const db = new DatabaseSync(process.env.DB_PATH ?? './friends.db')
db.prepare('PRAGMA journal_mode = WAL').get()
db.prepare(
  `CREATE TABLE IF NOT EXISTS users (
    uuid TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'offline',
    last_beat INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`
).run()
db.prepare(
  `CREATE TABLE IF NOT EXISTS friendships (
    a TEXT NOT NULL,
    b TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (a, b)
  )`
).run()

const q = {
  upsertUser: db.prepare(
    `INSERT INTO users (uuid, nickname, state, last_beat, created_at) VALUES (?, ?, 'offline', 0, ?)
     ON CONFLICT(uuid) DO UPDATE SET nickname = CASE WHEN excluded.nickname != '' THEN excluded.nickname ELSE users.nickname END`
  ),
  beat: db.prepare(`UPDATE users SET state = ?, last_beat = ? WHERE uuid = ?`),
  pair: db.prepare(`SELECT * FROM friendships WHERE a = ? AND b = ?`),
  insertPair: db.prepare(
    `INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?)`
  ),
  acceptPair: db.prepare(`UPDATE friendships SET status = 'accepted' WHERE a = ? AND b = ?`),
  deletePair: db.prepare(`DELETE FROM friendships WHERE a = ? AND b = ?`),
  mine: db.prepare(
    `SELECT f.status, f.requested_by, u.uuid, u.nickname, u.state, u.last_beat
     FROM friendships f
     JOIN users u ON u.uuid = CASE WHEN f.a = ? THEN f.b ELSE f.a END
     WHERE f.a = ? OR f.b = ?`
  )
}

// ---- session tokens (stateless HMAC) -----------------------------------------

const b64u = (buf) => Buffer.from(buf).toString('base64url')
function sign(payload) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}
function issueToken(uuid) {
  const payload = b64u(JSON.stringify({ uuid, exp: nowS() + TOKEN_TTL_S }))
  return `${payload}.${sign(payload)}`
}
function readToken(token) {
  if (typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  const a = Buffer.from(mac)
  const b = Buffer.from(sign(payload))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const { uuid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof uuid !== 'string' || typeof exp !== 'number' || exp < nowS()) return null
    return uuid
  } catch {
    return null
  }
}

// ---- helpers ------------------------------------------------------------------

const nowS = () => Math.floor(Date.now() / 1000)
const normUuid = (u) => String(u ?? '').replace(/-/g, '').toLowerCase()
const isUuid = (u) => /^[0-9a-f]{32}$/.test(u)
/** Canonical (a,b) ordering so one row covers both directions. */
const pairKey = (x, y) => (x < y ? [x, y] : [y, x])

const VALID_STATES = new Set(['idle', 'ranked', 'rsg', 'zsg'])

function liveState(row) {
  if (nowS() - row.last_beat > OFFLINE_AFTER_S) return 'offline'
  return row.state
}

// Pending Mojang handshake nonces: serverId -> { uuid, exp }.
const nonces = new Map()
setInterval(() => {
  const t = nowS()
  for (const [k, v] of nonces) if (v.exp < t) nonces.delete(k)
}, 30_000).unref()

// Dead-simple rate limiting: key -> [windowStart, count].
const buckets = new Map()
function limited(key, max, windowS = 60) {
  const t = nowS()
  const cur = buckets.get(key)
  if (!cur || t - cur[0] >= windowS) {
    buckets.set(key, [t, 1])
    return false
  }
  cur[1]++
  return cur[1] > max
}
setInterval(() => {
  const t = nowS()
  for (const [k, v] of buckets) if (t - v[0] > 120) buckets.delete(k)
}, 60_000).unref()

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 4096) throw new Error('body too large')
  }
  return raw ? JSON.parse(raw) : {}
}

function send(res, status, body) {
  const data = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS'
  })
  res.end(data)
}

// ---- Mojang verification -------------------------------------------------------

async function hasJoined(username, serverId) {
  const url = `https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(
    username
  )}&serverId=${encodeURIComponent(serverId)}`
  const res = await fetch(url)
  if (res.status !== 200) return null
  const body = await res.json()
  return body && typeof body.id === 'string' ? { uuid: normUuid(body.id), name: body.name } : null
}

// ---- routes ---------------------------------------------------------------------

async function route(req, res) {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname.replace(/\/+$/, '')
  const ip = req.socket.remoteAddress ?? '?'

  if (req.method === 'OPTIONS') return send(res, 204)
  if (path === '/v1/health') return send(res, 200, { ok: true })

  // -- auth (rate limited by ip) --
  if (path === '/v1/auth/handshake' && req.method === 'POST') {
    if (limited(`hs:${ip}`, 10)) return send(res, 429, { error: 'slow down' })
    const { uuid } = await readJson(req)
    const id = normUuid(uuid)
    if (!isUuid(id)) return send(res, 400, { error: 'bad uuid' })
    const serverId = randomBytes(20).toString('hex')
    nonces.set(serverId, { uuid: id, exp: nowS() + 120 })
    return send(res, 200, { serverId })
  }

  if (path === '/v1/auth/verify' && req.method === 'POST') {
    if (limited(`vf:${ip}`, 10)) return send(res, 429, { error: 'slow down' })
    const { uuid, username, serverId } = await readJson(req)
    const id = normUuid(uuid)
    const nonce = nonces.get(String(serverId))
    if (!nonce || nonce.uuid !== id) return send(res, 400, { error: 'unknown handshake' })
    nonces.delete(String(serverId))

    let proven = { uuid: id, name: String(username ?? '') }
    if (!DEV_UNVERIFIED) {
      const joined = await hasJoined(String(username ?? ''), String(serverId))
      if (!joined || joined.uuid !== id) return send(res, 401, { error: 'mojang verification failed' })
      proven = joined
    }
    q.upsertUser.run(proven.uuid, proven.name, nowS())
    return send(res, 200, { token: issueToken(proven.uuid), expiresIn: TOKEN_TTL_S })
  }

  // -- everything below requires a session token --
  const auth = req.headers.authorization ?? ''
  const me = readToken(auth.startsWith('Bearer ') ? auth.slice(7) : '')
  if (!me) return send(res, 401, { error: 'unauthorized' })
  if (limited(`tk:${me}`, 120)) return send(res, 429, { error: 'slow down' })

  if (path === '/v1/presence' && req.method === 'PUT') {
    const { state } = await readJson(req)
    q.beat.run(VALID_STATES.has(state) ? state : 'idle', nowS(), me)
    return send(res, 204)
  }

  if (path === '/v1/friends' && req.method === 'GET') {
    const rows = q.mine.all(me, me, me)
    const friends = []
    const incoming = []
    const outgoing = []
    for (const r of rows) {
      const accepted = r.status === 'accepted'
      // Presence (state + last-seen) is for ACCEPTED friends only. A pending request must never
      // leak the other player's presence — otherwise anyone could see your online status just by
      // sending you a request you never accepted.
      const entry = {
        uuid: r.uuid,
        nickname: r.nickname,
        state: accepted ? liveState(r) : 'offline',
        lastSeen: accepted ? r.last_beat || null : null
      }
      if (accepted) friends.push(entry)
      else if (r.requested_by === me) outgoing.push(entry)
      else incoming.push(entry)
    }
    return send(res, 200, { friends, incoming, outgoing })
  }

  if (path === '/v1/friends/requests' && req.method === 'POST') {
    const { to, nickname } = await readJson(req)
    const target = normUuid(to)
    if (!isUuid(target) || target === me) return send(res, 400, { error: 'bad target' })
    // Carry the target's known nickname so the sender's "request pending" row (and the
    // recipient, before they've ever heartbeated) shows a name, not "Unknown runner".
    const nick = typeof nickname === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(nickname) ? nickname : ''
    const [a, b] = pairKey(me, target)
    const existing = q.pair.get(a, b)
    if (existing) {
      // They already asked us -> asking back means yes.
      if (existing.status === 'pending' && existing.requested_by === target) q.acceptPair.run(a, b)
      return send(res, 204)
    }
    // The target may never have signed in yet; the request waits for them.
    q.upsertUser.run(target, nick, nowS())
    q.insertPair.run(a, b, 'pending', me, nowS())
    return send(res, 204)
  }

  const reqMatch = path.match(/^\/v1\/friends\/requests\/([0-9a-f]{32})\/(accept|decline)$/)
  if (reqMatch && req.method === 'POST') {
    const other = reqMatch[1]
    const [a, b] = pairKey(me, other)
    const existing = q.pair.get(a, b)
    if (!existing || existing.status !== 'pending' || existing.requested_by !== other) {
      return send(res, 404, { error: 'no such request' })
    }
    if (reqMatch[2] === 'accept') q.acceptPair.run(a, b)
    else q.deletePair.run(a, b)
    return send(res, 204)
  }

  const delMatch = path.match(/^\/v1\/friends\/([0-9a-f]{32})$/)
  if (delMatch && req.method === 'DELETE') {
    const [a, b] = pairKey(me, delMatch[1])
    q.deletePair.run(a, b)
    return send(res, 204)
  }

  return send(res, 404, { error: 'not found' })
}

createServer((req, res) => {
  route(req, res).catch((e) => {
    send(res, e instanceof SyntaxError || e.message === 'body too large' ? 400 : 500, {
      error: e.message ?? 'error'
    })
  })
}).listen(PORT, process.env.BIND || '0.0.0.0', () => {
  // BIND=127.0.0.1 when a TLS reverse proxy (Caddy) fronts this — keeps the raw HTTP
  // service off the public interface so only the proxy can reach it.
  console.log(
    `friends backend listening on ${process.env.BIND || '0.0.0.0'}:${PORT}${DEV_UNVERIFIED ? ' (UNVERIFIED DEV MODE)' : ''}`
  )
})
