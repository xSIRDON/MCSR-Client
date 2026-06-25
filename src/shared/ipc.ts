import type {
  AppConfig,
  InstanceId,
  InstanceStatus,
  Profile,
  ProgressEvent,
  TrackerStatus
} from './types'

export const IPC = {
  winMinimize: 'win:minimize',
  winClose: 'win:close',
  authLogin: 'auth:login',
  authRestore: 'auth:restore',
  authLogout: 'auth:logout',
  instStatus: 'inst:status',
  instInstall: 'inst:install',
  instLaunch: 'inst:launch',
  instVerify: 'inst:verify',
  instProgress: 'inst:progress',
  instStateChanged: 'inst:stateChanged',
  paceSetKey: 'pace:setKey',
  paceStatus: 'pace:status',
  paceStatusChanged: 'pace:statusChanged',
  cfgGet: 'cfg:get',
  cfgSet: 'cfg:set',
  cfgPickJar: 'cfg:pickJar'
} as const

export interface ObsidianApi {
  window: {
    minimize(): void
    close(): void
  }
  auth: {
    login(): Promise<Profile>
    restore(): Promise<Profile | null>
    logout(): Promise<void>
  }
  instances: {
    status(id: InstanceId): Promise<InstanceStatus>
    install(id: InstanceId): Promise<void>
    launch(id: InstanceId): Promise<void>
    verify(id: InstanceId): Promise<void>
    onProgress(cb: (e: ProgressEvent) => void): () => void
    onStateChanged(cb: (s: InstanceStatus) => void): () => void
  }
  paceman: {
    setKey(key: string): Promise<void>
    status(): Promise<TrackerStatus>
    onStatusChanged(cb: (s: TrackerStatus) => void): () => void
  }
  config: {
    get(): Promise<AppConfig>
    set(patch: Partial<AppConfig>): Promise<AppConfig>
    pickJar(): Promise<string | null>
  }
}

declare global {
  interface Window {
    obsidian: ObsidianApi
  }
}
