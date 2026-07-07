# MCSR Client — friends server

The backend for mutual friend requests and "in the client" presence. One file, **zero
dependencies** (Node 22.13+ with built-in SQLite). Identity is proven through Mojang's
session server — the same handshake real Minecraft servers use — so there are no
passwords or accounts to manage.

## Run it

```bash
SERVER_SECRET="any-long-random-string" node server.js
```

| Env | Default | Notes |
| --- | --- | --- |
| `SERVER_SECRET` | *(required)* | HMAC key for session tokens. Generate once (`openssl rand -hex 32`), never change it casually — changing it signs everyone out. |
| `PORT` | `8787` | |
| `DB_PATH` | `./friends.db` | SQLite file; put it on a persistent volume. |
| `DEV_ALLOW_UNVERIFIED` | off | `1` skips Mojang verification. Local testing only — never in production. |

## Deploy (Railway / Fly / any VPS)

- **Railway**: new project → deploy from repo, set the root directory to `server/`,
  add `SERVER_SECRET`, attach a volume mounted where `DB_PATH` points.
- **Fly.io**: `fly launch` in `server/`, `fly secrets set SERVER_SECRET=...`, add a
  volume for the database.
- **VPS**: `node server.js` under systemd behind Caddy/nginx for TLS.

Put TLS in front of it (Railway/Fly do this automatically). Then paste the public URL
into **Settings → Friends network** in the client and hit Connect.

## API sketch

```
POST /v1/auth/handshake            { uuid }                    -> { serverId }
POST /v1/auth/verify               { uuid, username, serverId } -> { token }
PUT  /v1/presence                  { state }                    (Bearer token)
GET  /v1/friends                                                (Bearer token)
POST /v1/friends/requests          { to }                       (Bearer token)
POST /v1/friends/requests/:uuid/accept | /decline               (Bearer token)
DELETE /v1/friends/:uuid                                        (Bearer token)
GET  /v1/health
```

Presence is only ever visible to accepted mutual friends. The database stores nothing
but uuids, nicknames, friendships, and last-heartbeat times.
