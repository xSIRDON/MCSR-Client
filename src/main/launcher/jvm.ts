// Which Java — and which garbage collector — the game runs on.
//
// Minecraft 1.16.1's version manifest asks for Java 8, and Java 8's G1 runs its full collections
// on a single thread. SeedQueue keeps many worlds generating at once, so the heap churns hard and
// every full collection freezes the whole game (the wall included) for seconds. Measured on a 10 GB
// wall session: ~2.8 s per full collection, ~20% of the session spent paused. More RAM only makes
// each freeze longer.
//
// So by default the game runs on Mojang's own Java 21 build (the runtime component the official
// launcher uses for modern versions) with ZGC, which collects concurrently. That's what SeedQueue's
// docs, the MCSR Java guide and the MCSR tech-support bot recommend for Java 17+, with the bot's
// flag set. Java 23 defaults ZGC to generational mode, which the guide found slower with SeedQueue,
// so it's switched back off there (24+ can't). Java 8-16 have no production ZGC and keep GMLL's
// stock G1 flags.

import { statSync } from 'node:fs'
import { join } from 'node:path'

/** Mojang's Java 21 runtime component. */
export const MANAGED_RUNTIME = 'java-runtime-delta'

export type GcKind = 'zgc' | 'g1'

/** ZGC on Windows needs Windows 10 1803 (build 17134) or newer. */
const MIN_ZGC_WINDOWS_BUILD = 17134

/** "10.0.26200" -> 26200 (os.release() on Windows); null for anything else. */
export function windowsBuildOf(release: string): number | null {
  const m = /^\d+\.\d+\.(\d+)/.exec(release)
  return m ? Number(m[1]) : null
}

/** ZGC for Java 17+ (on a Windows build that supports it), G1 for everything older. */
export function pickGc(
  javaMajor: number | null,
  platform: NodeJS.Platform,
  windowsBuild: number | null
): GcKind {
  if (javaMajor === null || javaMajor < 17) return 'g1'
  if (platform === 'win32' && (windowsBuild === null || windowsBuild < MIN_ZGC_WINDOWS_BUILD)) return 'g1'
  return 'zgc'
}

/**
 * JVM flags for the chosen collector. `g1Defaults` is GMLL's stock list (`-Xmx${ram}M`, G1 tuning,
 * the log4j lookup guard) and is used as-is for G1 — the two collectors can't be combined, so ZGC
 * gets its own list rather than an append. The ZGC set is the tech-support bot's; the Graal
 * inliner hint is an ordinary system property on other JVMs.
 */
export function jvmArgsFor(gc: GcKind, javaMajor: number | null, g1Defaults: readonly string[]): string[] {
  if (gc === 'g1') return [...g1Defaults]
  const args = ['-Xmx${ram}M', '-XX:+UseZGC']
  if (javaMajor === 23) args.push('-XX:-ZGenerational')
  args.push(
    '-XX:+AlwaysPreTouch',
    '-XX:NmethodSweepActivity=1',
    '-Djdk.graal.TuneInlinerExploration=1',
    '-Dlog4j2.formatMsgNoLookups=true'
  )
  return args
}

/** Fill GMLL's `${ram}` placeholder, for running a flag set outside GMLL (the startup probe). */
export function withRam(args: readonly string[], ramMb: number): string[] {
  return args.map((a) => a.split('${ram}').join(String(ramMb)))
}

/** The part of a Mojang runtime manifest the integrity check reads. */
export interface RuntimeManifest {
  files: Record<string, { type: string; downloads?: { raw?: { size: number } } }>
}

/**
 * Manifest files missing from `dir` or with the wrong size. A stat-only check, so it's cheap to run
 * before every launch — unlike re-running GMLL's downloader, which re-extracts every file and can't
 * overwrite the ones a running game has open.
 */
export function missingRuntimeFiles(manifest: RuntimeManifest, dir: string): string[] {
  const missing: string[] = []
  for (const [rel, entry] of Object.entries(manifest.files)) {
    if (entry.type !== 'file') continue
    const want = entry.downloads?.raw?.size
    try {
      const st = statSync(join(dir, ...rel.split('/')))
      if (!st.isFile() || (want !== undefined && st.size !== want)) missing.push(rel)
    } catch {
      missing.push(rel)
    }
  }
  return missing
}

/** "Java 21 (bundled) · ZGC" — what the launch log shows. */
export function describeJvm(major: number | null, custom: boolean, gc: GcKind): string {
  const java = major === null ? 'Java' : `Java ${major}`
  return `${java} (${custom ? 'custom' : 'bundled'}) · ${gc === 'zgc' ? 'ZGC' : 'G1'}`
}
