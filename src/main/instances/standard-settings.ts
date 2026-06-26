import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { StandardSettings } from '../../shared/types'

export function parseStandardSettings(text: string): StandardSettings {
  const out: StandardSettings = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const i = line.indexOf(':')
    if (i === -1) continue
    out[line.slice(0, i)] = line.slice(i + 1)
  }
  return out
}

export function mergeStandardSettings(text: string, patch: StandardSettings): string {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const i = line.indexOf(':')
    if (!line || i === -1) {
      result.push(raw)
      continue
    }
    const key = line.slice(0, i)
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      result.push(`${key}:${patch[key]}`)
      seen.add(key)
    } else {
      result.push(raw)
    }
  }
  for (const key of Object.keys(patch)) {
    if (!seen.has(key)) result.push(`${key}:${patch[key]}`)
  }
  return result.join('\n')
}

export function standardOptionsPath(gameDir: string): string {
  return join(gameDir, 'config', 'standardoptions.txt')
}

export function readStandardSettings(gameDir: string): StandardSettings {
  const file = standardOptionsPath(gameDir)
  if (!existsSync(file)) return {}
  return parseStandardSettings(readFileSync(file, 'utf8'))
}

export function writeStandardSettings(gameDir: string, patch: StandardSettings): StandardSettings {
  const file = standardOptionsPath(gameDir)
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const merged = mergeStandardSettings(existing, patch)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, merged, 'utf8')
  return parseStandardSettings(merged)
}
