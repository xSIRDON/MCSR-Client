// Detects the system Java the bundled tools run on (paceman tracker today,
// Ninjabrain Bot later) — these need Java 17+. The game itself uses GMLL's own
// bundled JRE, so this check is purely for the companion tools.

import { spawn } from 'node:child_process'
import type { JavaInfo } from '../../shared/types'

export const MIN_JAVA_MAJOR = 17

/** Parse the version string + major number from `java -version` output. */
export function parseJavaVersion(output: string): { version: string | null; major: number | null } {
  const m = output.match(/version "([^"]+)"/i)
  if (!m) return { version: null, major: null }
  const version = m[1]
  const parts = version.split('.')
  // "1.8.0_51" -> major 8 ; "17.0.19" -> 17 ; "21" -> 21
  const raw = parts[0] === '1' && parts.length > 1 ? parts[1] : parts[0]
  const major = parseInt(raw, 10)
  return { version, major: Number.isNaN(major) ? null : major }
}

/** Run `java -version` and report whether a usable (17+) runtime is on PATH. */
export async function detectJava(): Promise<JavaInfo> {
  return new Promise((resolve) => {
    let done = false
    const finish = (info: JavaInfo): void => {
      if (!done) {
        done = true
        resolve(info)
      }
    }
    const notFound: JavaInfo = { found: false, version: null, major: null, ok: false }

    try {
      const proc = spawn('java', ['-version'])
      let out = ''
      proc.stderr.on('data', (d) => (out += String(d)))
      proc.stdout.on('data', (d) => (out += String(d)))
      proc.on('error', () => finish(notFound))
      proc.on('close', () => {
        const { version, major } = parseJavaVersion(out)
        if (version === null) return finish(notFound)
        finish({ found: true, version, major, ok: major !== null && major >= MIN_JAVA_MAJOR })
      })
    } catch {
      finish(notFound)
    }
  })
}
