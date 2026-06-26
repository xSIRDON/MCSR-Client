// Reads and edits an instance's StandardSettings (config/standardoptions.txt).
// The format is one "key:value" per line, mirroring Minecraft's options.txt.
// Edits preserve original line order and any keys the UI doesn't know about.

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

/**
 * Apply `patch` to existing config text, keeping the original order and any keys
 * not present in the patch. New keys are appended in insertion order.
 */
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

/**
 * Import a Minecraft `options.txt` (same `key:value` format) into this instance's
 * standardoptions.txt, so the player's keybinds/sensitivity/video carry over. Some
 * keys (the window resolution, server list, etc.) aren't meaningful as defaults, so
 * they're skipped. Returns the number of settings imported.
 */
const IMPORT_SKIP = new Set(['version', 'lastServer', 'resourcePacks', 'incompatibleResourcePacks'])
// A real options.txt always carries several of these; a wrong .txt (a log, prose)
// carries none. Guard so the dialog filter — which the user can bypass — can't feed
// junk colon-bearing lines straight into standardoptions.txt.
const OPTIONS_MARKER = /^(version|key_|mouseSensitivity|fov|gamma|renderDistance|guiScale|soundCategory_|lang)$/

export function importOptionsFile(gameDir: string, sourceFile: string): number {
  const parsed = parseStandardSettings(readFileSync(sourceFile, 'utf8'))
  if (!Object.keys(parsed).some((k) => OPTIONS_MARKER.test(k))) {
    throw new Error("That file doesn't look like a Minecraft options.txt.")
  }
  const patch: StandardSettings = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (!IMPORT_SKIP.has(k)) patch[k] = v
  }
  writeStandardSettings(gameDir, patch)
  return Object.keys(patch).length
}
