import { spawn } from 'node:child_process'
import type { JavaInfo } from '../../shared/types'

export const MIN_JAVA_MAJOR = 17

export function parseJavaVersion(output: string): { version: string | null; major: number | null } {
  const m = output.match(/version "([^"]+)"/i)
  if (!m) return { version: null, major: null }
  const version = m[1]
  const parts = version.split('.')
  const raw = parts[0] === '1' && parts.length > 1 ? parts[1] : parts[0]
  const major = parseInt(raw, 10)
  return { version, major: Number.isNaN(major) ? null : major }
}

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
