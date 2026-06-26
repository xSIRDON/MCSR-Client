// IPC channel names + the typed API surface exposed on window.obsidian.
import type {
  Account,
  AppConfig,
  InstanceId,
  InstanceStatus,
  JavaInfo,
  LogLine,
  ModInfo,
  Profile,
  ProgressEvent,
  StandardSettings,
  TrackerStatus
} from './types'

export const IPC = {
  // window controls
  winMinimize: 'win:minimize',
  winClose: 'win:close',
  // auth
  authLogin: 'auth:login',
  authRestore: 'auth:restore',
  authLogout: 'auth:logout',
  authAccounts: 'auth:accounts',
  authAdd: 'auth:add',
  authSwitch: 'auth:switch',
  authRemove: 'auth:remove',
  // instances
  instStatus: 'inst:status',
  instInstall: 'inst:install',
  instLaunch: 'inst:launch',
  instVerify: 'inst:verify',
  instProgress: 'inst:progress', // main -> renderer stream
  instStateChanged: 'inst:stateChanged', // main -> renderer stream
  instMods: 'inst:mods',
  instToggleMod: 'inst:toggleMod',
  instOpenFolder: 'inst:openFolder',
  instStdGet: 'inst:stdGet',
  instStdSet: 'inst:stdSet',
  // system
  sysJava: 'sys:java',
  // logs
  logLine: 'log:line', // main -> renderer stream
  logHistory: 'log:history',
  logClear: 'log:clear',
  // paceman
  paceSetKey: 'pace:setKey',
  paceStatus: 'pace:status',
  paceStatusChanged: 'pace:statusChanged', // main -> renderer stream
  // config
  cfgGet: 'cfg:get',
  cfgSet: 'cfg:set',
  cfgPickJar: 'cfg:pickJar',
  cfgPickJava: 'cfg:pickJava'
} as const

/** The bridge surface available to the renderer as window.obsidian. */
export interface ObsidianApi {
  window: {
    minimize(): void
    close(): void
  }
  auth: {
    login(): Promise<Profile>
    restore(): Promise<Profile | null>
    logout(): Promise<void>
    accounts(): Promise<Account[]>
    add(): Promise<Profile>
    switch(uuid: string): Promise<Profile | null>
    remove(uuid: string): Promise<Account[]>
  }
  instances: {
    status(id: InstanceId): Promise<InstanceStatus>
    install(id: InstanceId): Promise<void>
    launch(id: InstanceId): Promise<void>
    verify(id: InstanceId): Promise<void>
    onProgress(cb: (e: ProgressEvent) => void): () => void
    onStateChanged(cb: (s: InstanceStatus) => void): () => void
    mods(id: InstanceId): Promise<ModInfo[]>
    toggleMod(id: InstanceId, file: string, enabled: boolean): Promise<ModInfo[]>
    openFolder(id: InstanceId): Promise<void>
    getStandardSettings(id: InstanceId): Promise<StandardSettings>
    setStandardSettings(id: InstanceId, patch: StandardSettings): Promise<StandardSettings>
  }
  system: {
    java(): Promise<JavaInfo>
  }
  logs: {
    history(): Promise<LogLine[]>
    clear(): Promise<void>
    onLine(cb: (line: LogLine) => void): () => void
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
    pickJava(): Promise<string | null>
  }
}

declare global {
  interface Window {
    obsidian: ObsidianApi
  }
}
