// Shared DTOs used across the main process, preload bridge, and renderer.

export type InstanceId = 'ranked' | 'rsg'

/** Minecraft account profile returned after Microsoft login. */
export interface Profile {
  uuid: string // dashless
  name: string
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
  ramMb: number
  /** Absolute path to a user-provided SeedQueue jar to override the pack's, or null. */
  seedQueueOverride: string | null
  /** Last seen MCSR username for the live-pace name match (defaults to profile name). */
  pacemanName: string | null
}

export const DEFAULT_CONFIG: AppConfig = {
  ramMb: 3072,
  seedQueueOverride: null,
  pacemanName: null
}
