// Shared DTOs used across the main process, preload bridge, and renderer.

export type InstanceId = 'ranked' | 'rsg'

/** Minecraft account profile returned after Microsoft login. */
export interface Profile {
  uuid: string // dashless
  name: string
}

/** A stored Microsoft account shown in the account switcher (no token exposed). */
export interface Account {
  uuid: string
  name: string
  active: boolean
}

/** Progress event streamed during install/launch. */
export interface ProgressEvent {
  instance: InstanceId
  phase: 'java' | 'client' | 'assets' | 'libraries' | 'fabric' | 'mods' | 'configs' | 'launch'
  /** 0..1, or null for indeterminate. */
  fraction: number | null
  message: string
}

export type InstanceState =
  | 'not-installed'
  | 'installing'
  | 'ready'
  | 'launching'
  | 'running'
  | 'error'

export interface InstanceStatus {
  id: InstanceId
  state: InstanceState
  /** Pack versionId currently installed, if known. */
  versionId?: string
  error?: string
}

export interface TrackerStatus {
  running: boolean
  hasKey: boolean
  message?: string
}

export interface AppConfig {
  /** Per-instance allocated RAM, in MB. */
  ram: Record<InstanceId, number>
  /** Per-instance Java executable path override; null = use the bundled JRE. */
  java: Record<InstanceId, string | null>
  /** Absolute path to a user-provided SeedQueue jar to override the pack's, or null. */
  seedQueueOverride: string | null
  /** Last seen MCSR username for the live-pace name match (defaults to profile name). */
  pacemanName: string | null
}

export const DEFAULT_CONFIG: AppConfig = {
  ram: { ranked: 3072, rsg: 3072 },
  java: { ranked: null, rsg: null },
  seedQueueOverride: null,
  pacemanName: null
}

/** A single mod jar inside an instance's mods/ folder. */
export interface ModInfo {
  /** On-disk base filename of the jar (without any trailing ".disabled"). */
  file: string
  /** Display name derived from the filename. */
  name: string
  /** Version string derived from the filename, or '' when none is present. */
  version: string
  /** False when the jar is parked as "<file>.disabled". */
  enabled: boolean
}

/** System Java detection. The bundled tools (paceman, later Ninjabrain) need Java 17+. */
export interface JavaInfo {
  found: boolean
  version: string | null
  major: number | null
  /** True when Java is present and major >= 17. */
  ok: boolean
}

/** StandardSettings config as key->value pairs (mirrors standardoptions.txt on disk). */
export type StandardSettings = Record<string, string>

/** A line of console output streamed to the UI (game stdout/stderr or client lifecycle). */
export interface LogLine {
  source: 'game' | 'system'
  text: string
}
