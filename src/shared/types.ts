export type InstanceId = 'ranked' | 'rsg'

export interface Profile {
  uuid: string
  name: string
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
  ramMb: number
  seedQueueOverride: string | null
  pacemanName: string | null
}

export const DEFAULT_CONFIG: AppConfig = {
  ramMb: 3072,
  seedQueueOverride: null,
  pacemanName: null
}
