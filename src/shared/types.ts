export type InstanceId = 'ranked' | 'rsg'

export interface Profile {
  uuid: string
  name: string
}

export interface Account {
  uuid: string
  name: string
  active: boolean
}

export interface ProgressEvent {
  instance: InstanceId
  phase: 'java' | 'client' | 'assets' | 'libraries' | 'fabric' | 'mods' | 'configs' | 'launch'
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
  versionId?: string
  error?: string
}

export interface TrackerStatus {
  running: boolean
  hasKey: boolean
  message?: string
}

export interface AppConfig {
  ram: Record<InstanceId, number>
  java: Record<InstanceId, string | null>
  seedQueueOverride: string | null
  pacemanName: string | null
}

export const DEFAULT_CONFIG: AppConfig = {
  ram: { ranked: 3072, rsg: 3072 },
  java: { ranked: null, rsg: null },
  seedQueueOverride: null,
  pacemanName: null
}

export interface ModInfo {
  file: string
  name: string
  version: string
  enabled: boolean
}

export interface JavaInfo {
  found: boolean
  version: string | null
  major: number | null
  ok: boolean
}

export type StandardSettings = Record<string, string>

export interface LogLine {
  source: 'game' | 'system'
  text: string
}
