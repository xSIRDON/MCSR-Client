# Friends backend — design

Status: **built and deployed** — the implementation lives in [`server/`](../server/) (see its
README for deployment) and the client integration in `src/main/friends/`. This document is the
original design; it matches what was built. Phase 1 (the watchlist) remains: favorites stored
locally, presence derived from public feeds (MCSR `/live`, paceman `liveruns`, `lastOnline`).

## What a backend unlocks

| Capability | Phase 1 (no backend) | Phase 2 |
| --- | --- | --- |
| Favorite any runner | ✅ local list | ✅ synced across installs |
| See who's in a ranked match / on RSG pace | ✅ public feeds | ✅ same |
| See who has **MCSR Client open** ("in the client") | ❌ impossible | ✅ heartbeat presence |
| **Mutual** friends (request / accept) | ❌ one-way stars | ✅ |
| What screen a friend is on (idle / queueing / practicing) | ❌ | ✅ optional rich presence |

## Identity: prove the Minecraft account, no passwords

Use the same handshake Minecraft servers use — the Mojang session server:

1. Client asks backend for a nonce → backend returns `serverId` (random string).
2. Client calls Mojang `joinServer(accessToken, selectedProfile, serverIdHash)` using the
   session it already holds (the launcher signs players in with MSA anyway).
3. Client tells the backend "I joined `serverId` as uuid X".
4. Backend calls `sessionserver.mojang.com/session/minecraft/hasJoined?username=...&serverId=...`.
   A hit is cryptographic proof the caller owns that Minecraft account.
5. Backend issues a signed session token (JWT, 30-day, uuid claim). The client stores it
   in the OS keychain next to the paceman key.

No password, no OAuth app registration, no email — identity *is* the Minecraft account,
which is exactly the identity the rest of the app already uses.

## API surface (tiny)

```
POST /auth/handshake        -> { serverId }
POST /auth/verify           -> { token }            (uuid + serverId; backend checks hasJoined)

PUT  /presence              -> 204                  (heartbeat: { state: 'idle'|'ranked'|'rsg'|'zsg' })
GET  /presence?uuids=a,b,c  -> [{ uuid, state, lastSeen }]

POST /friends/requests      -> 204                  ({ to: uuid })
POST /friends/requests/:id/accept | /decline
DELETE /friends/:uuid
GET  /friends               -> { friends: [...], incoming: [...], outgoing: [...] }
```

- Heartbeat every 60 s while the app is open; `state` comes from the instance manager
  (`running` per instance id). Missing 3 beats = offline.
- `GET /presence` only answers for uuids that are **confirmed mutual friends** of the
  caller — presence is never public.

## Storage

Three tables; SQLite is enough for tens of thousands of users, Postgres if it grows.

```
users    (uuid PK, nickname, created_at, presence_opt_in)
friends  (a UUID, b UUID, status: pending|accepted, requested_by, created_at,  PK (a,b))
presence (uuid PK, state, last_beat)   -- or keep in memory/Redis; it's ephemeral
```

## Hosting

A single small node process (Fastify/Hono) + SQLite on a $5 VPS / Fly.io / Railway handles
this comfortably: the write load is one heartbeat per open client per minute. Put it behind
Cloudflare for TLS + rate limiting. Version the API (`/v1/...`) so old clients degrade
gracefully — the rail simply falls back to phase-1 public-feed presence if the backend is
unreachable.

## Privacy rules (non-negotiable)

- Presence is **opt-in** (Settings toggle, default off). Until enabled, the client never
  heartbeats and other players see only public-feed status.
- Presence is visible to **accepted mutual friends only** — never to one-way favorites.
- Deleting a friend (either direction) immediately stops visibility both ways.
- The backend stores nothing but uuid, nickname, friendships, and the last heartbeat.

## Client integration sketch

- `services/friends-api.ts` — typed client for the endpoints above.
- Rail merges presence tiers: backend `in client (state)` > ranked `/live` > paceman pace >
  `lastOnline` > offline.
- Friend requests surface in the rail header (badge) with accept/decline inline.
- Local favorites migrate: on first login the client offers "send friend requests to your
  starred runners who also use MCSR Client".
