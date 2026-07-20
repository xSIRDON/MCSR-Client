# Ship the extra-options mod with RSG / ZSG — design

**Date:** 2026-07-20
**Instances in scope:** `rsg`, `zsg` (Ranked excluded — its managed modpack already has extra-options)
**Status:** approved design, pending spec review

## Goal

Add the legal **extra-options** mod
([tildejustin/extra-options](https://github.com/tildejustin/extra-options), v2.2.1 for
1.16.1) to the RSG and ZSG instances, covering every way an instance can reach that state:

1. **New installs** get it automatically.
2. **Existing installs** are offered it once, via an opt-in prompt.
3. **The manage area** has an "Add extra-options" button for anyone who removed it or said
   no — and the existing Mods card still enables/disables it.

The mod jar and its sha512 come from the same source mc.sr/mods trusts (tildejustin's
`mcsr-meta`); downloads are hash-verified with the existing `verifyBuffer` helper.

## Scenarios covered

| # | Situation | How it's handled |
|---|-----------|------------------|
| A1 | Fresh RSG/ZSG install | Auto-installed after configs (Part A) |
| A2 | RSG/ZSG already installed, missing it | One-time opt-in prompt on startup (Part C) |
| A3 | User declined the prompt, or removed it, wants it later | "Add extra-options" button in the manage area (Part B) |
| A4 | Already present (any way) | Idempotent — install skips it; button hidden; prompt won't show |
| A5 | Ranked | Out of scope — already ships it |

## Non-goals (explicitly dropped from the earlier draft)

- No live legal-mods catalog from `mcsr-meta`.
- No "add an arbitrary mod from file".
- No per-mod remove action (enable/disable in the existing Mods card is enough).

These can come back later; this spec is just extra-options.

## The mod

```ts
// src/main/ipc-handlers.ts
const EXTRA_OPTIONS_MOD = {
  file: 'extra-options-2.2.1+1.16.1.jar',
  // Primary: the author's GitHub release. Fallback: the legal-mods mirror mcsr-meta points
  // at. Both are the same jar; whichever verifies against the hash first is used.
  urls: [
    'https://github.com/tildejustin/extra-options/releases/download/v2.2.1/extra-options-2.2.1+1.16.1.jar',
    'https://github.com/Minecraft-Java-Edition-Speedrunning/legal-mods/raw/2ba63fc475270404e4a1c1f910f22bdc9bc14186/legal-mods/extra-options/1.16-1.16.1/extra-options-2.2.1+1.16.1.jar'
  ],
  sha512:
    'd2a997eb2a19c09fb2d548df4f7de85020079124fe64a1a5b5393419df3a070d76faee11f6df364310145baeccbbc99c9237bf8264bf1419f98482a82c2dc544'
}
```

## Part A — install on fresh RSG/ZSG installs

Today ZSG's FSG mod is a bespoke `FSG_MOD` constant + `installFsgMod`. Generalise both into
one helper so extra-options and FSG share a single, tested code path:

```ts
// download (try each url) -> verify sha512 if present -> write into mods/.
// Idempotent: no-op if the jar (or its .disabled twin) is already there.
async function installModJar(
  gameDir: string,
  id: InstanceId,
  mod: { file: string; urls: string[]; sha512?: string },
  label: string
): Promise<void>
```

The multi-URL + verify loop mirrors what `installPackFiles` already does per pack file.

In `installInstance`, after `writeRsgConfigs`, for `rsg`/`zsg`:

1. `installModJar(gameDir, id, EXTRA_OPTIONS_MOD, 'extra-options')`
2. ZSG additionally installs FSG (unchanged behaviour) through the same helper.

Best-effort: wrapped in try/catch + `pushLog` like `installFsgMod` today, so a failed fetch
never fails the install.

## Part B — "Add extra-options" button in the manage area

**Presence check** — new pure helper in `src/main/instances/mods.ts`:

```ts
// True if a jar whose parsed mod-name is "extra-options" exists in modsDir,
// enabled or parked as .disabled. Uses the existing parseModFilename.
export function hasExtraOptions(modsDir: string): boolean
```

**UI** — extend the existing `ModsCard` in `src/renderer/pages/Instance.tsx`:

- For `rsg`/`zsg` only, when `mods` is loaded and none parse to `extra-options`, show an
  **"Add extra-options"** button (styled like the card's other buttons) above/at the top of
  the list.
- Click → `window.mcsr.instances.addExtraOptions([id])`, then refetch `mods(id)` so the
  button disappears and the mod shows in the list with its enable/disable toggle.
- Busy + inline error states while downloading (same shape as the existing cards).

Once installed, disabling/re-enabling uses the existing `toggleMod` — no change there.

## Part C — one-time prompt for existing installs

**Persisted flag** — add `extraOptionsPromptSeen: boolean` (default `false`) to `AppConfig`
(`src/shared/types.ts`) and hydrate it in `src/main/store.ts` like the other fields.

**Eligibility** — pure, unit-tested helper:

```ts
// show === true iff !seen AND some installed (state 'ready') rsg/zsg lacks extra-options.
// instances === the installed rsg/zsg missing it.
function shouldPromptExtraOptions(
  seen: boolean,
  states: { id: InstanceId; ready: boolean; hasExtraOptions: boolean }[]
): { show: boolean; instances: InstanceId[] }
```

Fail-safe: on any error determining state, return `show: false` — never nag on uncertainty.

**UI** — new `src/renderer/components/ExtraOptionsPrompt.tsx`, a small modal styled after
`InstallMapPicker.tsx`'s overlay, mounted once near the app root (Play page). On mount it
calls `extraOptionsPrompt()`; if `show`, it renders:

> **Add the extra-options mod to your instance?**
> extra-options is a legal MCSR mod. Add it to your installed RSG/ZSG instance(s)?
> **[Add it]**  **[No thanks]**

- **Add it** → `addExtraOptions(instances)`, then `dismissExtraOptionsPrompt()` → close.
- **No thanks** / backdrop / Esc → `dismissExtraOptionsPrompt()` → close.

`dismissExtraOptionsPrompt()` is the "mark seen" op — both paths call it, so the prompt
appears at most once. (`addExtraOptions` itself never sets the flag, which is why the
manage-area button doesn't suppress a future prompt for the other instance.)

## IPC wiring

Three new channels in `src/shared/ipc.ts` (+ `preload/index.ts` bridge + `ipc-handlers.ts`
handlers):

| Channel | API on `window.mcsr.instances` | Returns |
|---------|-------------------------------|---------|
| `instExtraOptionsPrompt` | `extraOptionsPrompt()` | `{ show: boolean; instances: InstanceId[] }` |
| `instAddExtraOptions` | `addExtraOptions(instances: InstanceId[])` | `void` |
| `instDismissExtraOptionsPrompt` | `dismissExtraOptionsPrompt()` | `void` |

`addExtraOptions` installs into each given instance via `installModJar`; when called from
the manage button it's just `[id]`; from the prompt it's the eligible set. It does **not**
set the seen-flag (only the prompt's accept/dismiss paths do), so using the button later
doesn't suppress a future prompt for the other instance.

Enable/disable continues to use the existing `toggleMod`.

## Error handling

- **Download fails / all URLs fail:** install-time → try/catch + `pushLog`, install
  proceeds; button/prompt → surface an inline error, leave state unchanged.
- **Hash mismatch:** `verifyBuffer` throws; the jar is not written; next URL is tried.
- **Idempotency:** `installModJar` skips a jar already on disk; `hasExtraOptions` treats
  enabled and `.disabled` as present.
- **Prompt uncertainty:** `shouldPromptExtraOptions` returns `show: false`.

## Testing

- `src/main/instances/mods.test.ts` (extend):
  - `installModJar` — writes the jar; idempotent second call; verifies sha512 (mismatch
    throws, no file written); falls through to the second URL when the first fails — all
    with an injected `fetchBuffer`, like the mrpack tests.
  - `hasExtraOptions` — true for `extra-options-*.jar` and its `.disabled`, false otherwise.
- Prompt eligibility: `shouldPromptExtraOptions` across seen/unseen × ready/not ×
  has/hasn't, asserting `show` and the `instances` list.

## Files touched

- `src/shared/types.ts` — `extraOptionsPromptSeen` on `AppConfig`
- `src/shared/ipc.ts` — 3 new channels + API signatures
- `src/main/instances/mods.ts` — `installModJar`, `hasExtraOptions`
- `src/main/instances/mods.test.ts` — tests
- `src/main/ipc-handlers.ts` — `EXTRA_OPTIONS_MOD`, fold FSG into `installModJar`, install
  call for rsg/zsg, `shouldPromptExtraOptions`, 3 handlers
- `src/main/store.ts` — hydrate `extraOptionsPromptSeen`
- `src/preload/index.ts` — bridge the 3 methods
- `src/renderer/pages/Instance.tsx` — "Add extra-options" button in `ModsCard`
- `src/renderer/components/ExtraOptionsPrompt.tsx` — **new** one-time modal, wired at app root
