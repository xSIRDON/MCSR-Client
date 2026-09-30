import { statSync } from 'node:fs'
import { join } from 'node:path'

export const MANAGED_RUNTIME = 'java-runtime-delta'

export type GcKind = 'zgc' | 'g1'

const MIN_ZGC_WINDOWS_BUILD = 17134

export function windowsBuildOf(release: string): number | null {
  const m = /^\d+\.\d+\.(\d+)/.exec(release)
  return m ? Number(m[1]) : null
}

export function pickGc(
  javaMajor: number | null,
  platform: NodeJS.Platform,
  windowsBuild: number | null
): GcKind {
  if (javaMajor === null || javaMajor < 17) return 'g1'
  if (platform === 'win32' && (windowsBuild === null || windowsBuild < MIN_ZGC_WINDOWS_BUILD)) return 'g1'
  return 'zgc'
}

export function jvmArgsFor(gc: GcKind, javaMajor: number | null, g1Defaults: readonly string[]): string[] {
  if (gc === 'g1') return [...g1Defaults]
  const args = ['-Xms${ram}M', '-Xmx${ram}M', '-XX:+UseZGC']
  if (javaMajor === 23) args.push('-XX:-ZGenerational')
  args.push(
    '-XX:NmethodSweepActivity=1',
    '-Djdk.graal.TuneInlinerExploration=1',
    '-Dlog4j2.formatMsgNoLookups=true'
  )
  return args
}

export const GC_LOG_FILE = 'logs/gc.log'

export function gcLogArg(): string {
  return `-Xlog:gc:file=${GC_LOG_FILE}:uptime:filecount=2,filesize=10M`
}

export function withRam(args: readonly string[], ramMb: number): string[] {
  return args.map((a) => a.split('${ram}').join(String(ramMb)))
}

export interface RuntimeManifest {
  files: Record<string, { type: string; downloads?: { raw?: { size: number } } }>
}

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

export function describeJvm(major: number | null, custom: boolean, gc: GcKind): string {
  const java = major === null ? 'Java' : `Java ${major}`
  return `${java} (${custom ? 'custom' : 'bundled'}) · ${gc === 'zgc' ? 'ZGC' : 'G1'}`
}
