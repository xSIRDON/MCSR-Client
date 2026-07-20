# extra-options Mod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the legal `extra-options` mod to the RSG and ZSG instances — auto-installed on fresh installs, offered once to existing installs via a prompt, and addable any time from the manage area.

**Architecture:** A tested, injectable `installModJar` download helper (main process) that both the fresh-install path and an "add" IPC call reuse. A persisted `extraOptionsPromptSeen` config flag gates a one-time React modal shown at app startup. The manage-area Mods card gains an "Add extra-options" button when the mod is absent. Downloads are sha512-verified via the existing `verifyBuffer`.

**Tech Stack:** Electron + electron-vite, React 18 + TypeScript, Tailwind, Vitest. IPC via `ipcMain.handle` / `contextBridge` (preload) / `window.mcsr`.

**Spec:** [docs/superpowers/specs/2026-07-20-extra-options-mod-design.md](../specs/2026-07-20-extra-options-mod-design.md)
**Branch:** `feature/legal-mods-management` (already checked out; spec already committed).

## Global Constraints

- Windows-only Electron app; Minecraft 1.16.1 + Fabric. Only `rsg` and `zsg` get extra-options — **never** `ranked` (its managed modpack already ships it).
- The mod jar is exactly `extra-options-2.2.1+1.16.1.jar` with sha512 `d2a997eb2a19c09fb2d548df4f7de85020079124fe64a1a5b5393419df3a070d76faee11f6df364310145baeccbbc99c9237bf8264bf1419f98482a82c2dc544`.
- All mod installs are **best-effort**: a failed download must never fail an instance install.
- Toggle-off of an installed mod = **disable** (`.disabled`), never delete — this is existing `toggleMod` behavior, unchanged.
- Installs are **idempotent**: skip if the jar (enabled or `.disabled`) already exists.
- TDD for pure logic (`installModJar`, `hasExtraOptions`, `shouldPromptExtraOptions`). Wiring (types, IPC, preload, React) is verified with `npm run typecheck` + `npm run build` — `store.ts`/`ipc-handlers.ts` import `electron` and can't run under Vitest.
- Commit after every task. End each commit message with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Add the `extraOptionsPromptSeen` config flag

**Files:**
- Modify: `src/shared/types.ts` (`AppConfig` interface + `DEFAULT_CONFIG`)
- Modify: `src/main/store.ts` (`RawConfig` type + `normalizeConfig`)

**Interfaces:**
- Produces: `AppConfig.extraOptionsPromptSeen: boolean` (default `false`), persisted and hydrated like every other config field.

- [ ] **Step 1: Add the field to the `AppConfig` interface**

In `src/shared/types.ts`, inside `interface AppConfig { ... }`, add after the `friendsServerUrl` field (the last one, ending `friendsServerUrl: string | null`):

```ts
  /** Whether the one-time "add extra-options to existing installs" prompt has been answered. */
  extraOptionsPromptSeen: boolean
```

- [ ] **Step 2: Add the default**

In `src/shared/types.ts`, in `export const DEFAULT_CONFIG: AppConfig = { ... }`, add after `friendsServerUrl: DEFAULT_FRIENDS_SERVER`:

```ts
  ,
  extraOptionsPromptSeen: false
```

(Ensure the object stays valid — the `friendsServerUrl` line gets a trailing comma, then the new key.)

- [ ] **Step 3: Accept it in the raw stored shape**

In `src/main/store.ts`, in `type RawConfig = { ... }`, add:

```ts
  extraOptionsPromptSeen?: boolean
```

- [ ] **Step 4: Hydrate it in `normalizeConfig`**

In `src/main/store.ts`, in the object returned by `normalizeConfig`, add after the `friendsServerUrl` block:

```ts
    ,
    extraOptionsPromptSeen:
      typeof raw.extraOptionsPromptSeen === 'boolean'
        ? raw.extraOptionsPromptSeen
        : DEFAULT_CONFIG.extraOptionsPromptSeen
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (exit 0). If `AppConfig` is missing the field anywhere it's constructed, tsc will point to it.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/store.ts
git commit -m "$(printf 'feat(config): add extraOptionsPromptSeen flag\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: `installModJar` + `hasExtraOptions` download/presence helpers

**Files:**
- Modify: `src/main/instances/mods.ts`
- Test: `src/main/instances/mods.test.ts`

**Interfaces:**
- Consumes: `verifyBuffer(buf, { sha512 })` from `./mrpack` (existing, throws on mismatch); `listMods`, `parseModFilename`, `DISABLED` from this file.
- Produces:
  - `type FetchBuffer = (url: string) => Promise<Buffer>`
  - `interface JarMod { file: string; urls: string[]; sha512?: string }`
  - `installModJar(modsDir: string, mod: JarMod, fetchBuffer?: FetchBuffer): Promise<boolean>` — returns `true` if it wrote a jar, `false` if it skipped (already present); throws if every URL fails.
  - `hasExtraOptions(modsDir: string): boolean`

- [ ] **Step 1: Write the failing tests**

In `src/main/instances/mods.test.ts`, change the top imports to add `createHash` and the new functions:

```ts
import { createHash } from 'node:crypto'
import { parseModFilename, listMods, setModEnabled, installModJar, hasExtraOptions } from './mods'
```

Then append these two `describe` blocks to the end of the file:

```ts
describe('installModJar', () => {
  const made: string[] = []
  function tmpMods(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
    made.push(d)
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  })

  const body = Buffer.from('fake-jar-bytes')
  const sha512 = createHash('sha512').update(body).digest('hex')

  it('downloads, verifies sha512, and writes the jar', async () => {
    const dir = tmpMods()
    const wrote = await installModJar(
      dir,
      { file: 'x-1.0.jar', urls: ['https://a/x.jar'], sha512 },
      async () => body
    )
    expect(wrote).toBe(true)
    expect(existsSync(join(dir, 'x-1.0.jar'))).toBe(true)
  })

  it('is idempotent when the jar exists and never fetches', async () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'x-1.0.jar'), '')
    let calls = 0
    const wrote = await installModJar(dir, { file: 'x-1.0.jar', urls: ['https://a/x.jar'] }, async () => {
      calls++
      return body
    })
    expect(wrote).toBe(false)
    expect(calls).toBe(0)
  })

  it('skips when a .disabled twin exists', async () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'x-1.0.jar.disabled'), '')
    const wrote = await installModJar(dir, { file: 'x-1.0.jar', urls: ['https://a/x.jar'] }, async () => body)
    expect(wrote).toBe(false)
    expect(existsSync(join(dir, 'x-1.0.jar'))).toBe(false)
  })

  it('rejects a hash mismatch and writes nothing', async () => {
    const dir = tmpMods()
    await expect(
      installModJar(dir, { file: 'x-1.0.jar', urls: ['https://a/x.jar'], sha512: 'deadbeef' }, async () => body)
    ).rejects.toThrow()
    expect(existsSync(join(dir, 'x-1.0.jar'))).toBe(false)
  })

  it('falls through to the next url when the first fails', async () => {
    const dir = tmpMods()
    const fetchBuffer = async (url: string) => {
      if (url.includes('good')) return body
      throw new Error('boom')
    }
    const wrote = await installModJar(
      dir,
      { file: 'x-1.0.jar', urls: ['https://bad/x.jar', 'https://good/x.jar'], sha512 },
      fetchBuffer
    )
    expect(wrote).toBe(true)
    expect(existsSync(join(dir, 'x-1.0.jar'))).toBe(true)
  })
})

describe('hasExtraOptions', () => {
  const made: string[] = []
  function tmpMods(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
    made.push(d)
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  })

  it('detects an enabled extra-options jar', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'extra-options-2.2.1+1.16.1.jar'), '')
    expect(hasExtraOptions(dir)).toBe(true)
  })

  it('detects a parked .disabled extra-options jar', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'extra-options-2.2.1+1.16.1.jar.disabled'), '')
    expect(hasExtraOptions(dir)).toBe(true)
  })

  it('is false when no extra-options jar is present', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sodium-2.5.1.jar'), '')
    expect(hasExtraOptions(dir)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/instances/mods.test.ts`
Expected: FAIL — `installModJar is not a function` / `hasExtraOptions is not a function` (import errors).

- [ ] **Step 3: Implement the helpers**

In `src/main/instances/mods.ts`, update the fs import (first import line) to add `mkdirSync` and `writeFileSync`:

```ts
import { existsSync, readdirSync, renameSync, mkdirSync, writeFileSync } from 'node:fs'
```

Add an import for the hash verifier below the existing imports:

```ts
import { verifyBuffer } from './mrpack'
```

Then append to the end of the file:

```ts
export type FetchBuffer = (url: string) => Promise<Buffer>

const nodeFetchBuffer: FetchBuffer = async (url) => {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

export interface JarMod {
  /** Destination filename inside mods/. */
  file: string
  /** Mirror URLs, tried in order until one downloads and verifies. */
  urls: string[]
  /** Expected sha512 (hex); when set, a downloaded jar must match or it's rejected. */
  sha512?: string
}

/**
 * Download a single mod jar into `modsDir`, verifying its sha512 when provided.
 * Idempotent: if the jar (or its ".disabled" twin) is already present it does nothing
 * and returns false. Tries each URL until one downloads and verifies; returns true when a
 * jar was written, throws if every URL fails.
 */
export async function installModJar(
  modsDir: string,
  mod: JarMod,
  fetchBuffer: FetchBuffer = nodeFetchBuffer
): Promise<boolean> {
  mkdirSync(modsDir, { recursive: true })
  const dest = join(modsDir, mod.file)
  if (existsSync(dest) || existsSync(dest + DISABLED)) return false
  let lastErr: unknown
  for (const url of mod.urls) {
    try {
      const buf = await fetchBuffer(url)
      if (mod.sha512) verifyBuffer(buf, { sha512: mod.sha512 })
      writeFileSync(dest, buf)
      return true
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`Failed to install ${mod.file}: ${String(lastErr)}`)
}

/** True if an extra-options jar is present in `modsDir` (enabled or parked as .disabled). */
export function hasExtraOptions(modsDir: string): boolean {
  return listMods(modsDir).some((m) => m.name.toLowerCase() === 'extra-options')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/instances/mods.test.ts`
Expected: PASS — all `installModJar` and `hasExtraOptions` cases green, existing cases still green.

- [ ] **Step 5: Commit**

```bash
git add src/main/instances/mods.ts src/main/instances/mods.test.ts
git commit -m "$(printf 'feat(instances): installModJar + hasExtraOptions helpers\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: `shouldPromptExtraOptions` eligibility helper

**Files:**
- Modify: `src/main/instances/mods.ts`
- Test: `src/main/instances/mods.test.ts`

**Interfaces:**
- Consumes: `InstanceId` from `../../shared/types`.
- Produces:
  - `interface InstanceModState { id: InstanceId; ready: boolean; hasExtraOptions: boolean }`
  - `shouldPromptExtraOptions(seen: boolean, states: InstanceModState[]): { show: boolean; instances: InstanceId[] }`

- [ ] **Step 1: Write the failing tests**

In `src/main/instances/mods.test.ts`, add `shouldPromptExtraOptions` to the functions import from `./mods`:

```ts
import {
  parseModFilename,
  listMods,
  setModEnabled,
  installModJar,
  hasExtraOptions,
  shouldPromptExtraOptions
} from './mods'
```

Append this `describe` block to the end of the file:

```ts
describe('shouldPromptExtraOptions', () => {
  it('does not show once the prompt has been seen', () => {
    expect(
      shouldPromptExtraOptions(true, [{ id: 'rsg', ready: true, hasExtraOptions: false }])
    ).toEqual({ show: false, instances: [] })
  })

  it('shows for installed instances missing extra-options', () => {
    expect(
      shouldPromptExtraOptions(false, [
        { id: 'rsg', ready: true, hasExtraOptions: false },
        { id: 'zsg', ready: true, hasExtraOptions: true }
      ])
    ).toEqual({ show: true, instances: ['rsg'] })
  })

  it('ignores instances that are not installed', () => {
    expect(
      shouldPromptExtraOptions(false, [{ id: 'rsg', ready: false, hasExtraOptions: false }])
    ).toEqual({ show: false, instances: [] })
  })

  it('does not show when every installed instance already has it', () => {
    expect(
      shouldPromptExtraOptions(false, [
        { id: 'rsg', ready: true, hasExtraOptions: true },
        { id: 'zsg', ready: true, hasExtraOptions: true }
      ])
    ).toEqual({ show: false, instances: [] })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/instances/mods.test.ts`
Expected: FAIL — `shouldPromptExtraOptions is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/main/instances/mods.ts`, update the shared-types import at the top to include `InstanceId`:

```ts
import type { InstanceId, ModInfo } from '../../shared/types'
```

Append to the end of the file:

```ts
/** Precomputed per-instance facts the prompt-eligibility check needs. */
export interface InstanceModState {
  id: InstanceId
  ready: boolean
  hasExtraOptions: boolean
}

/**
 * Decide whether to show the one-time "add extra-options" prompt. Show it when the prompt
 * hasn't been answered and at least one installed (ready) instance is missing extra-options;
 * `instances` is exactly those installed-and-missing instances.
 */
export function shouldPromptExtraOptions(
  seen: boolean,
  states: InstanceModState[]
): { show: boolean; instances: InstanceId[] } {
  if (seen) return { show: false, instances: [] }
  const instances = states.filter((s) => s.ready && !s.hasExtraOptions).map((s) => s.id)
  return { show: instances.length > 0, instances }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/instances/mods.test.ts`
Expected: PASS — all four new cases green.

- [ ] **Step 5: Commit**

```bash
git add src/main/instances/mods.ts src/main/instances/mods.test.ts
git commit -m "$(printf 'feat(instances): shouldPromptExtraOptions eligibility helper\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: IPC surface + main install wiring

**Files:**
- Modify: `src/shared/ipc.ts` (channel names + `McsrApi.instances` signatures)
- Modify: `src/preload/index.ts` (bridge the three methods)
- Modify: `src/main/ipc-handlers.ts` (constants, install-on-install, fold FSG, three handlers)

**Interfaces:**
- Consumes: `installModJar`, `hasExtraOptions`, `shouldPromptExtraOptions` (Tasks 2–3); `store.getConfig()/setConfig()`, `gmll.gameDir(id)`, module-level `states`, `sendProgress`, `pushLog` (existing in `ipc-handlers.ts`).
- Produces on `window.mcsr.instances`:
  - `extraOptionsPrompt(): Promise<{ show: boolean; instances: InstanceId[] }>`
  - `addExtraOptions(instances: InstanceId[]): Promise<void>`
  - `dismissExtraOptionsPrompt(): Promise<void>`

- [ ] **Step 1: Add the IPC channel names**

In `src/shared/ipc.ts`, in the `export const IPC = { ... }` object, add after the `instToggleMod: 'inst:toggleMod',` line:

```ts
  instExtraOptionsPrompt: 'inst:extraOptionsPrompt',
  instAddExtraOptions: 'inst:addExtraOptions',
  instDismissExtraOptionsPrompt: 'inst:dismissExtraOptionsPrompt',
```

- [ ] **Step 2: Add the typed API signatures**

In `src/shared/ipc.ts`, in `interface McsrApi { instances: { ... } }`, add after the `toggleMod(...)` line (`toggleMod(id: InstanceId, file: string, enabled: boolean): Promise<ModInfo[]>`):

```ts
    /** Whether to show the one-time extra-options prompt, and for which installed instances. */
    extraOptionsPrompt(): Promise<{ show: boolean; instances: InstanceId[] }>
    /** Install extra-options into each given instance (idempotent, best-effort per instance). */
    addExtraOptions(instances: InstanceId[]): Promise<void>
    /** Record that the one-time extra-options prompt has been answered. */
    dismissExtraOptionsPrompt(): Promise<void>
```

- [ ] **Step 3: Bridge the methods in preload**

In `src/preload/index.ts`, in the `instances: { ... }` object, add after the `toggleMod: (...) => ...` entry (ends `ipcRenderer.invoke(IPC.instToggleMod, id, file, enabled),`):

```ts
    extraOptionsPrompt: () => ipcRenderer.invoke(IPC.instExtraOptionsPrompt),
    addExtraOptions: (instances: InstanceId[]) =>
      ipcRenderer.invoke(IPC.instAddExtraOptions, instances),
    dismissExtraOptionsPrompt: () => ipcRenderer.invoke(IPC.instDismissExtraOptionsPrompt),
```

- [ ] **Step 4: Import the new main helpers**

In `src/main/ipc-handlers.ts`, replace the existing mods import line

```ts
import { listMods, setModEnabled } from './instances/mods'
```

with:

```ts
import {
  listMods,
  setModEnabled,
  installModJar,
  hasExtraOptions,
  shouldPromptExtraOptions
} from './instances/mods'
```

- [ ] **Step 5: Replace `FSG_MOD` + `installFsgMod` with the shared helper**

In `src/main/ipc-handlers.ts`, replace the whole block (the `const FSG_MOD = {...}` through the end of `async function installFsgMod(...) { ... }`) with:

```ts
const EXTRA_OPTIONS_MOD = {
  file: 'extra-options-2.2.1+1.16.1.jar',
  // Primary: the author's GitHub release. Fallback: the legal-mods mirror mcsr-meta points at.
  // Both are the same jar; whichever verifies against the hash first is used.
  urls: [
    'https://github.com/tildejustin/extra-options/releases/download/v2.2.1/extra-options-2.2.1+1.16.1.jar',
    'https://github.com/Minecraft-Java-Edition-Speedrunning/legal-mods/raw/2ba63fc475270404e4a1c1f910f22bdc9bc14186/legal-mods/extra-options/1.16-1.16.1/extra-options-2.2.1+1.16.1.jar'
  ],
  sha512:
    'd2a997eb2a19c09fb2d548df4f7de85020079124fe64a1a5b5393419df3a070d76faee11f6df364310145baeccbbc99c9237bf8264bf1419f98482a82c2dc544'
}

const FSG_MOD = {
  file: 'FSG-Mod-5.3.0+MC1.16.1.jar',
  urls: ['https://cdn.modrinth.com/data/XZOGBIpM/versions/qc4OUmcd/FSG-Mod-5.3.0%2BMC1.16.1.jar']
}

/** Download one legal add-on mod jar into the instance's mods/, surfacing progress. */
async function installInstanceMod(
  gameDir: string,
  id: InstanceId,
  mod: { file: string; urls: string[]; sha512?: string },
  label: string
): Promise<void> {
  sendProgress({ instance: id, phase: 'mods', fraction: null, message: `Installing ${label}…` })
  await installModJar(join(gameDir, 'mods'), mod)
}
```

- [ ] **Step 6: Install extra-options (and FSG) during install**

In `src/main/ipc-handlers.ts`, in `installInstance`, replace the single line

```ts
    if (id === 'zsg') await installFsgMod(gameDir, id)
```

with:

```ts
    // Legal add-on mods: extra-options for RSG/ZSG, plus FSG for ZSG. Best-effort — a failed
    // fetch must never fail the install; the prompt/manage button can add it later.
    if (id === 'rsg' || id === 'zsg') {
      try {
        await installInstanceMod(gameDir, id, EXTRA_OPTIONS_MOD, 'extra-options')
      } catch (e) {
        pushLog('system', `extra-options install skipped: ${e instanceof Error ? e.message : e}`)
      }
    }
    if (id === 'zsg') {
      try {
        await installInstanceMod(gameDir, id, FSG_MOD, 'FSG mod')
      } catch (e) {
        pushLog('system', `FSG mod install skipped: ${e instanceof Error ? e.message : e}`)
      }
    }
```

- [ ] **Step 7: Register the three IPC handlers**

In `src/main/ipc-handlers.ts`, immediately after the `ipcMain.handle(IPC.instToggleMod, ...)` block (the one that ends with `return listMods(dir)` then `})`), add:

```ts
  ipcMain.handle(IPC.instExtraOptionsPrompt, () => {
    try {
      const seen = store.getConfig().extraOptionsPromptSeen
      const checks = (['rsg', 'zsg'] as InstanceId[]).map((id) => ({
        id,
        ready: states[id].state === 'ready',
        hasExtraOptions: hasExtraOptions(join(gmll.gameDir(id), 'mods'))
      }))
      return shouldPromptExtraOptions(seen, checks)
    } catch {
      // Never nag on uncertainty.
      return { show: false, instances: [] as InstanceId[] }
    }
  })
  ipcMain.handle(IPC.instAddExtraOptions, async (_e, ids: InstanceId[]) => {
    for (const id of ids) {
      await installInstanceMod(gmll.gameDir(id), id, EXTRA_OPTIONS_MOD, 'extra-options')
    }
  })
  ipcMain.handle(IPC.instDismissExtraOptionsPrompt, () => {
    store.setConfig({ extraOptionsPromptSeen: true })
  })
```

- [ ] **Step 8: Typecheck and build**

Run: `npm run typecheck`
Expected: exit 0, no errors. (This confirms every reference to the removed `installFsgMod` is gone and the new API types line up across shared/preload/main.)

Run: `npm run build`
Expected: electron-vite build completes for main, preload, and renderer with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main/ipc-handlers.ts
git commit -m "$(printf 'feat(instances): install extra-options for RSG/ZSG + prompt IPC\n\nInstalls extra-options on fresh RSG/ZSG installs via a shared installModJar\nhelper (FSG folded in), and adds extraOptionsPrompt/addExtraOptions/\ndismissExtraOptionsPrompt IPC.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: "Add extra-options" button in the manage-area Mods card

**Files:**
- Modify: `src/renderer/pages/Instance.tsx` (the `ModsCard` function only)

**Interfaces:**
- Consumes: `window.mcsr.instances.mods(id)`, `window.mcsr.instances.toggleMod(...)` (existing), `window.mcsr.instances.addExtraOptions([id])` (Task 4).

- [ ] **Step 1: Replace the `ModsCard` component**

In `src/renderer/pages/Instance.tsx`, replace the entire `function ModsCard({ id }: { id: InstanceId }) { ... }` with:

```tsx
function ModsCard({ id }: { id: InstanceId }) {
  const [mods, setMods] = useState<ModInfo[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void window.mcsr.instances.mods(id).then(setMods)
  }, [id])

  const toggle = (file: string, enabled: boolean) =>
    void window.mcsr.instances.toggleMod(id, file, enabled).then(setMods)

  const extraOptionsInstalled = !!mods?.some((m) => m.name.toLowerCase() === 'extra-options')
  const canAddExtraOptions = (id === 'rsg' || id === 'zsg') && mods !== null && !extraOptionsInstalled

  async function addExtraOptions() {
    setAdding(true)
    setError(null)
    try {
      await window.mcsr.instances.addExtraOptions([id])
      setMods(await window.mcsr.instances.mods(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add extra-options.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card title={`Mods${mods ? ` · ${mods.length}` : ''}`}>
      {canAddExtraOptions && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-[var(--gold)]/30 bg-[var(--gold)]/[0.06] px-3 py-2">
          <div className="min-w-0 text-sm text-muted">
            <span className="text-text">extra-options</span> — a legal MCSR mod, not installed on
            this instance.
          </div>
          <button
            onClick={addExtraOptions}
            disabled={adding}
            className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add extra-options'}
          </button>
        </div>
      )}
      {error && <div className="mb-2 text-xs text-[var(--loss)]">{error}</div>}
      {!mods ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : mods.length === 0 ? (
        <div className="text-sm text-muted">No mods yet — install or launch this instance first.</div>
      ) : (
        <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {mods.map((m) => (
            <div
              key={m.file}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-1.5"
              style={{ opacity: m.enabled ? 1 : 0.55 }}
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-text">{m.name}</div>
                {m.version && <div className="text-xs text-faint">{m.version}</div>}
              </div>
              <Toggle on={m.enabled} onChange={(v) => toggle(m.file, v)} />
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-faint">
        Disabling a mod parks it as <code>.disabled</code>. Note: removing pack mods can make a run
        illegal or break Ranked.
      </p>
    </Card>
  )
}
```

- [ ] **Step 2: Typecheck the renderer**

Run: `npm run typecheck:web`
Expected: exit 0.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: renderer builds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/Instance.tsx
git commit -m "$(printf 'feat(ui): Add extra-options button in the instance Mods card\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: One-time `ExtraOptionsPrompt` modal, mounted at app root

**Files:**
- Create: `src/renderer/components/ExtraOptionsPrompt.tsx`
- Modify: `src/renderer/App.tsx` (import + mount next to `InstallMapPicker`)

**Interfaces:**
- Consumes: `window.mcsr.instances.extraOptionsPrompt()`, `addExtraOptions(instances)`, `dismissExtraOptionsPrompt()` (Task 4).

- [ ] **Step 1: Create the modal component**

Create `src/renderer/components/ExtraOptionsPrompt.tsx` with exactly:

```tsx
import { useEffect, useState } from 'react'
import type { InstanceId } from '@shared/types'

const TITLES: Record<InstanceId, string> = { ranked: 'Ranked', rsg: 'RSG', zsg: 'ZSG' }

/** One-time opt-in: offer extra-options to already-installed RSG/ZSG instances that lack it. */
export function ExtraOptionsPrompt() {
  const [prompt, setPrompt] = useState<{ show: boolean; instances: InstanceId[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.mcsr.instances.extraOptionsPrompt().then(setPrompt)
  }, [])

  if (!prompt || !prompt.show) return null

  async function addIt() {
    setBusy(true)
    setError(null)
    try {
      await window.mcsr.instances.addExtraOptions(prompt!.instances)
      await window.mcsr.instances.dismissExtraOptionsPrompt()
      setPrompt({ show: false, instances: [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the mod. Try again from Edit instance.')
      setBusy(false)
    }
  }

  async function dismiss() {
    await window.mcsr.instances.dismissExtraOptionsPrompt()
    setPrompt({ show: false, instances: [] })
  }

  const names = prompt.instances.map((i) => TITLES[i]).join(' and ')

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 animate-fade-up"
      onClick={() => !busy && void dismiss()}
    >
      <div className="surface w-full max-w-[440px] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg tracking-wide text-text">Add the extra-options mod?</h2>
        <p className="mt-2 text-sm text-muted">
          <span className="text-text">extra-options</span> is a legal MCSR mod. Add it to your
          installed {names} instance{prompt.instances.length === 1 ? '' : 's'}?
        </p>
        {error && <div className="mt-2 text-xs text-[var(--loss)]">{error}</div>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => void dismiss()}
            disabled={busy}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            No thanks
          </button>
          <button
            onClick={() => void addIt()}
            disabled={busy}
            className="font-display rounded-lg px-5 py-2 text-sm tracking-wide text-[#07140a] disabled:opacity-60"
            style={{
              background: 'linear-gradient(180deg,#6fcf57,#4ea73e)',
              boxShadow: '0 8px 24px rgba(94,167,62,.4), inset 0 1px 0 rgba(255,255,255,.25)'
            }}
          >
            {busy ? 'Adding…' : 'Add it'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Import it in `App.tsx`**

In `src/renderer/App.tsx`, next to the existing `import { InstallMapPicker } from './components/InstallMapPicker'` line, add:

```tsx
import { ExtraOptionsPrompt } from './components/ExtraOptionsPrompt'
```

- [ ] **Step 3: Mount it next to `InstallMapPicker`**

In `src/renderer/App.tsx`, find the `<InstallMapPicker />` line and add directly below it:

```tsx
          <ExtraOptionsPrompt />
```

- [ ] **Step 4: Typecheck the renderer**

Run: `npm run typecheck:web`
Expected: exit 0.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: renderer builds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ExtraOptionsPrompt.tsx src/renderer/App.tsx
git commit -m "$(printf 'feat(ui): one-time extra-options prompt for existing installs\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass, including the new `installModJar`, `hasExtraOptions`, and `shouldPromptExtraOptions` cases.

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: exit 0 for both `typecheck:node` and `typecheck:web`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: main + preload + renderer build cleanly.

- [ ] **Step 4: Manual smoke (run the client)**

Run: `npm run dev`
Verify, as available:
- The app launches with no console errors from the new IPC channels.
- Open **Edit instance** for RSG or ZSG. If extra-options is not installed, the gold "Add extra-options" panel shows; clicking it downloads the jar, the panel disappears, and `extra-options` appears in the mod list with a working enable/disable toggle.
- With an installed RSG/ZSG that lacks extra-options and `extraOptionsPromptSeen: false` in the config file, the one-time modal appears on launch; **Add it** installs it, **No thanks** dismisses it, and it does not reappear on the next launch.

Note: the prompt only fires when a `ready` RSG/ZSG instance is actually installed and missing the mod — on a machine with no installed instances it correctly stays hidden.

---

## Self-Review

**Spec coverage:**
- A1 fresh install auto-install → Task 4 Step 6. ✅
- A2 one-time prompt → Task 4 (handlers) + Task 6 (modal). ✅
- A3 add later via manage area → Task 5. ✅
- A4 idempotency → Task 2 (`installModJar` skip) + Task 5/6 hide-when-present. ✅
- A5 Ranked excluded → guarded by `id === 'rsg' || id === 'zsg'` in Task 4 and `canAddExtraOptions` in Task 5. ✅
- sha512 verification → Task 2 (`verifyBuffer`). ✅
- Best-effort install → Task 4 Step 6 try/catch. ✅
- Persisted flag + hydrate → Task 1. ✅
- IPC/preload wiring → Task 4. ✅
- Tests (install/presence/eligibility) → Tasks 2–3. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `JarMod`/`installModJar` signature identical across Tasks 2 and 4; `{ show, instances }` shape identical across `shouldPromptExtraOptions` (Task 3), IPC signature (Task 4), and the modal state (Task 6); `addExtraOptions(instances: InstanceId[])` identical across shared/preload/handlers/renderer. ✅
