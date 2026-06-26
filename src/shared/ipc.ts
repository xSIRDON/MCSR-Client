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
  TrackerStatus,
  UpdateStatus
} from './types'

export const IPC = {
  winMinimize: 'win:minimize',
  winClose: 'win:close',
  authLogin: 'auth:login',
  authRestore: 'auth:restore',
  authLogout: 'auth:logout',
  authAccounts: 'auth:accounts',
  authAdd: 'auth:add',
  authSwitch: 'auth:switch',
  authRemove: 'auth:remove',
  instStatus: 'inst:status',
  instInstall: 'inst:install',
  instLaunch: 'inst:launch',
  instVerify: 'inst:verify',
  instDelete: 'inst:delete',
  instSyncMaps: 'inst:syncMaps',
  instProgress: 'inst:progress',
  instStateChanged: 'inst:stateChanged',
  instMods: 'inst:mods',
  instToggleMod: 'inst:toggleMod',
  instOpenFolder: 'inst:openFolder',
  instStdGet: 'inst:stdGet',
  instStdSet: 'inst:stdSet',
  instImportSettings: 'inst:importSettings',
  instImportFromInstance: 'inst:importFromInstance',
  instInstalledIds: 'inst:installedIds',
  sysJava: 'sys:java',
  updCheck: 'upd:check',
  updStatus: 'upd:status',
  updInstall: 'upd:install',
  updStatusChanged: 'upd:statusChanged',
  logLine: 'log:line',
  logHistory: 'log:history',
  logClear: 'log:clear',
  paceSetKey: 'pace:setKey',
  paceStatus: 'pace:status',
  paceStatusChanged: 'pace:statusChanged',
  cfgGet: 'cfg:get',
  cfgSet: 'cfg:set',
  cfgPickJar: 'cfg:pickJar',
  cfgPickJava: 'cfg:pickJava'
} as const

export interface McsrApi {
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
    launch(id: InstanceId, opts?: { importFrom?: InstanceId | null }): Promise<void>
    verify(id: InstanceId): Promise<void>
    delete(id: InstanceId): Promise<void>
    syncMaps(id: InstanceId): Promise<void>
    onProgress(cb: (e: ProgressEvent) => void): () => void
    onStateChanged(cb: (s: InstanceStatus) => void): () => void
    mods(id: InstanceId): Promise<ModInfo[]>
    toggleMod(id: InstanceId, file: string, enabled: boolean): Promise<ModInfo[]>
    openFolder(id: InstanceId): Promise<void>
    getStandardSettings(id: InstanceId): Promise<StandardSettings>
    setStandardSettings(id: InstanceId, patch: StandardSettings): Promise<StandardSettings>
    importSettings(id: InstanceId): Promise<{ imported: number } | null>
    installedIds(): Promise<InstanceId[]>
    importFromInstance(target: InstanceId, source: InstanceId): Promise<{ copied: string[] }>
  }
  system: {
    java(): Promise<JavaInfo>
  }
  updater: {
    check(): Promise<UpdateStatus>
    status(): Promise<UpdateStatus>
    install(): Promise<void>
    onStatusChanged(cb: (s: UpdateStatus) => void): () => void
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
    mcsr: McsrApi
  }
}
