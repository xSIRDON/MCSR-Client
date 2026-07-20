# Legal-mods management — design

**Date:** 2026-07-20
**Instances in scope:** `rsg`, `zsg` (Ranked is excluded — its managed modpack already ships extra-options)
**Status:** approved design, pending spec review

## Goal

Two things the user asked for, plus full coverage of every way a mod can be added or
managed:

1. Ship the **extra-options** mod with RSG and ZSG.
2. Give the manage area (Edit-instance page) a place to **add, enable, and disable
   speedrun-legal mods** — now and in the future, including mods that are not (yet) on the
   official list.

The catalog of legal mods is sourced live from the same data
[mc.sr/mods](https://mc.sr/mods/) uses: tildejustin's `mcsr-meta`
(`https://raw.githubusercontent.com/tildejustin/mcsr-meta/schema-7/mods.json`). Every
download is verified against the sha512 the meta provides, reusing the existing
`verifyBuffer` helper.

## Scenarios covered

Adding **extra-options** specifically:

| # | Situation | How it's handled |
|---|-----------|------------------|
| A1 | Fresh RSG/ZSG install | Auto-installed after configs (Part A) |
| A2 | RSG/ZSG already installed, missing it | One-time opt-in prompt on startup (Part C) |
| A3 | User declined the prompt, wants it later | Legal-mods card toggle (Part B) |
| A4 | Ranked | Out of scope — already has it |

General legal mods, present and future:

| # | Situation | How it's handled |
|---|-----------|------------------|
| B1 | Any mod on the official list | Appears in the Legal-mods card; toggle to add/enable/disable |
| B2 | A mod added to the official list in the future | Shows up automatically — the list is fetched live, no client update needed |
| B3 | A mod **not** on the official list (custom / personal / future) | "Add a mod from file…" — pick a `.jar`, copied into `mods/` |

Managing what's installed:

| # | Situation | How it's handled |
|---|-----------|------------------|
| C1 | Enable/disable any on-disk mod | Existing Mods card (unchanged) |
| C2 | Remove a mod entirely | New per-mod remove action in the Mods card, behind a confirm, with the existing legality warning |
| C3 | Open the mods folder directly | Existing Files card (unchanged) |

## Non-goals (YAGNI)

- **Dependency resolution.** `mcsr-meta` lists per-version dependencies. extra-options has
  none. If a chosen mod declares unmet dependencies we surface a short note rather than
  auto-installing them. Full dep resolution is out of scope for v1.
- **Ranked modpack editing.** Ranked's mod set stays managed by the pack + latest-ranked flow.
- **Version pinning UI.** We install the meta's recommended 1.16.1 version; no per-mod
  version dropdown.

---

## Part A — extra-options on fresh installs

**Where:** `installInstance` in `src/main/ipc-handlers.ts`, after configs are written, for
`rsg`/`zsg` only.

Today ZSG's FSG mod is installed by a bespoke `FSG_MOD` constant + `installFsgMod`. Fold
both that and the new default-mod install into one helper:

```ts
// download -> verify (if hash) -> write into mods/. Idempotent: skips if the jar
// (or its .disabled twin) already exists.
async function installModJar(
  gameDir: string,
  id: InstanceId,
  mod: { file: string; url: string; sha512?: string; sha1?: string; label?: string }
): Promise<void>
```

Flow for rsg/zsg:

1. After `writeRsgConfigs`, look up the default-on set (`DEFAULT_MODS = ['extra-options']`,
   see Part B) in the fetched catalog, resolve each to its 1.16.1 version, and
   `installModJar` it.
2. ZSG additionally installs FSG (unchanged behaviour) via the same helper.

Best-effort: wrap in try/catch and `pushLog` on failure exactly like `installFsgMod` does
today, so a failed fetch never fails the install.

## Part B — the Legal-mods catalog + manage card

### Data layer (main) — new `src/main/instances/mod-catalog.ts`

```ts
export const MOD_CATALOG_URL =
  'https://raw.githubusercontent.com/tildejustin/mcsr-meta/schema-7/mods.json'

// Raw meta shape (subset we use)
interface MetaModVersion {
  version: string
  target_version: string[]
  url: string
  sha512?: string
  sha1?: string
  size?: number
  dependencies?: string[]
  recommended?: boolean
  obsolete?: boolean
}
interface MetaMod {
  modid: string
  name: string
  description?: string
  homepage?: string
  versions: MetaModVersion[]
  traits?: string[]
  recommended?: boolean
}
```

Pure, unit-tested helpers:

- `parseMeta(json): MetaMod[]` — validate it's an array of mods.
- `pick1161(mod): ResolvedVersion | null` — choose the best version whose
  `target_version` includes `"1.16.1"`: prefer `recommended && !obsolete`, else newest
  non-obsolete. Returns `{ version, url, file, sha512?, sha1?, size?, dependencies }` where
  `file = decodeURIComponent(basename(url))`.
- `catalogForInstance(mods, opts): CatalogMod[]` — keep mods that have a 1.16.1 version;
  **exclude** `mac-only` (Windows-only app) and `ssg-only` (rsg/zsg are not set-seed); keep
  everything else including `accessibility`. Sort by name.

Network + cache: `fetchCatalog()` fetches once and memoises in-process (mirrors the
existing `cachedIndex` pattern), with a `refresh` escape hatch for the card's Retry.

### Shared type — `src/shared/types.ts`

```ts
export interface CatalogMod {
  modid: string
  name: string
  description: string
  homepage: string | null
  file: string          // resolved 1.16.1 jar filename
  url: string
  sha512: string | null
  sha1: string | null
  traits: string[]
  dependencies: string[]
  installed: boolean     // a matching jar (enabled or .disabled) is on disk
  enabled: boolean       // matching jar present and not parked as .disabled
}
```

Matching an installed jar: parse the on-disk filenames with the existing
`parseModFilename` and compare the mod-name segment against the catalog file's parsed
name (case-insensitive). Same heuristic the app already trusts for mod names.

### Default-on set — `src/shared/mods.ts` (new, tiny)

```ts
export const DEFAULT_MODS: string[] = ['extra-options'] // modids auto-installed for rsg/zsg
```

### Manage card (renderer) — new `LegalModsCard` in `src/renderer/pages/Instance.tsx`

Placed above the existing `ModsCard`. Built like `MapsCard`:

- On mount, `window.mcsr.instances.modCatalog(id)` → `CatalogMod[]`.
- Each row: name, description, trait chips (e.g. `accessibility`), optional homepage link,
  and a `Toggle` (reusing the existing `Toggle` component) whose on-state = `enabled`.
- Toggle transitions:
  - **on**, `!installed` → `installMod(id, modid)` (downloads; row shows a busy state)
  - **on**, `installed && !enabled` → `toggleMod(id, file, true)` (existing IPC)
  - **off** → `toggleMod(id, file, false)` (existing IPC — disables, keeps the file)
- Below the list: an **"Add a mod from file…"** button (Part B3) → `addModFile(id)`.
- States: loading; empty (shouldn't happen once online); **offline/error** → inline
  "Couldn't load the legal-mods list · Retry" that calls the refresh path.
- Gate: if the instance has no `mods/` yet (not installed), the card shows
  "Install or launch this instance first" like the Mods card does, and add actions are
  disabled.

The existing generic `ModsCard` is unchanged except for Part C2 (remove action).

## Part B3 — add an arbitrary mod from a file

For legal mods not on the list (or personal jars). New main handler
`instAddModFile(id)`:

```ts
// opens a .jar file picker; if chosen, copies it into the instance's mods/ and
// returns the refreshed ModInfo[] (or null if cancelled).
```

Uses `dialog.showOpenDialog` with a `jar` filter (same shape as the SeedQueue picker at
`ipc-handlers.ts:499`, but copying into `mods/` instead of setting `seedQueueOverride`).
Validates the `.jar` extension; refuses to overwrite silently (if a same-named jar exists,
it's a no-op returning the current list — the user can remove first).

## Part C — one-time prompt for existing installs

### Persisted flag — `src/main/store.ts` + `AppConfig`

Add `extraOptionsPromptSeen: boolean` (default `false`) to `AppConfig`
(`src/shared/types.ts`), hydrated in `store.ts` like the other config fields.

### Eligibility (main, pure + unit-tested)

`shouldPromptExtraOptions(config, installedStates): { show: boolean; instances: InstanceId[] }`:

- `show` is true iff `!config.extraOptionsPromptSeen` **and** at least one of `rsg`/`zsg`
  is installed (`state === 'ready'`) and does **not** already have extra-options on disk.
- `instances` = the installed rsg/zsg that are missing it.

Fail-safe: if installed-state can't be determined (e.g. catalog/fs error), return
`show: false` — never nag on uncertainty.

### IPC

- `instExtraOptionsPrompt()` → `{ show: boolean; instances: InstanceId[] }`
- `instAddExtraOptions(instances: InstanceId[])` → installs extra-options into each via
  `installModJar`, then sets `extraOptionsPromptSeen = true`. Returns void.
- `instDismissExtraOptionsPrompt()` → sets `extraOptionsPromptSeen = true`.

### UI — small modal component

New `ExtraOptionsPrompt.tsx` (styled after `InstallMapPicker.tsx`'s overlay). Mounted once
near the app root / Play page. On mount it calls `instExtraOptionsPrompt()`; if `show`, it
renders:

> **Add the extra-options mod to your instance?**
> extra-options is a legal MCSR mod. Add it to your installed RSG/ZSG instance(s)?
> **[Add it]** **[No thanks]**

- **Add it** → `instAddExtraOptions(instances)` → close.
- **No thanks** / backdrop / Esc → `instDismissExtraOptionsPrompt()` → close.

Either resolution sets the flag, so it appears at most once.

## Wiring summary

New IPC channels in `src/shared/ipc.ts` (+ `preload/index.ts` bridge + `ipc-handlers.ts`
handlers):

| Channel | API on `window.mcsr.instances` | Returns |
|---------|-------------------------------|---------|
| `instModCatalog` | `modCatalog(id)` | `CatalogMod[]` |
| `instInstallMod` | `installMod(id, modid)` | `CatalogMod[]` (refreshed) |
| `instAddModFile` | `addModFile(id)` | `ModInfo[] \| null` |
| `instRemoveMod` | `removeMod(id, file)` | `ModInfo[]` |
| `instExtraOptionsPrompt` | `extraOptionsPrompt()` | `{ show, instances }` |
| `instAddExtraOptions` | `addExtraOptions(instances)` | `void` |
| `instDismissExtraOptionsPrompt` | `dismissExtraOptionsPrompt()` | `void` |

Enable/disable continues to use the existing `toggleMod`.

## Error handling

- **Catalog fetch fails:** card → inline error + Retry; install-time defaults → try/catch +
  `pushLog`, install proceeds; prompt eligibility → `show: false`.
- **Hash mismatch:** `verifyBuffer` throws; jar is not written; the caller surfaces the
  error (card) or logs it (install-time).
- **Idempotency:** `installModJar` and catalog install skip a jar already on disk;
  disable/remove tolerate an absent file.
- **Not installed yet:** add actions gated behind an existing `mods/` dir.

## Testing

- `src/main/instances/mod-catalog.test.ts` (new): `parseMeta`, `pick1161`
  (1.16.1 selection, recommended vs newest, obsolete skipped, filename from URL),
  `catalogForInstance` (mac-only + ssg-only excluded, accessibility kept, sort).
- `src/main/instances/mods.test.ts` (extend): `installModJar` writes the jar, is
  idempotent, and verifies sha512 — using an injected `fetchBuffer` like the mrpack tests.
- Prompt logic: unit test `shouldPromptExtraOptions` across
  seen/unseen × installed/not × has/hasn't extra-options.

## Files touched

- `src/shared/types.ts` — `CatalogMod`, `extraOptionsPromptSeen` on `AppConfig`
- `src/shared/ipc.ts` — new channels + API signatures
- `src/shared/mods.ts` — **new**, `DEFAULT_MODS`
- `src/main/instances/mod-catalog.ts` — **new**, catalog fetch/parse/filter
- `src/main/instances/mods.ts` — `installModJar`, install/remove/state helpers
- `src/main/instances/mod-catalog.test.ts`, `mods.test.ts` — tests
- `src/main/ipc-handlers.ts` — fold FSG into `installModJar`, default-mod install, new handlers
- `src/main/store.ts` — hydrate `extraOptionsPromptSeen`
- `src/preload/index.ts` — bridge new methods
- `src/renderer/pages/Instance.tsx` — `LegalModsCard`, remove action on `ModsCard`
- `src/renderer/components/ExtraOptionsPrompt.tsx` — **new** one-time modal, wired at app root
