// IPC channel names + the typed API surface exposed on window.mcsr.
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
  instDelete: 'inst:delete',
  instSyncMaps: 'inst:syncMaps',
  instProgress: 'inst:progress', // main -> renderer stream
  instStateChanged: 'inst:stateChanged', // main -> renderer stream
  instMods: 'inst:mods',
  instToggleMod: 'inst:toggleMod',
  instOpenFolder: 'inst:openFolder',
  instStdGet: 'inst:stdGet',
  instStdSet: 'inst:stdSet',
  instImportSettings: 'inst:importSettings',
  instImportFromInstance: 'inst:importFromInstance',
  instImportFromFolderPath: 'inst:importFromFolderPath',
  instInstalledIds: 'inst:installedIds',
  instListWorlds: 'inst:listWorlds',
  instListWorldsInFolder: 'inst:listWorldsInFolder',
  // system
  sysJava: 'sys:java',
  // app updates
  updCheck: 'upd:check',
  updStatus: 'upd:status',
  updInstall: 'upd:install',
  updStatusChanged: 'upd:statusChanged', // main -> renderer stream
  // logs
  logLine: 'log:line', // main -> renderer stream
  logHistory: 'log:history',
  logClear: 'log:clear',
  // paceman
  paceSetKey: 'pace:setKey',
  paceGetKey: 'pace:getKey',
  paceStatus: 'pace:status',
  paceStatusChanged: 'pace:statusChanged', // main -> renderer stream
  // config
  cfgGet: 'cfg:get',
  cfgSet: 'cfg:set',
  cfgPickJar: 'cfg:pickJar',
  cfgPickJava: 'cfg:pickJava',
  cfgPickFolder: 'cfg:pickFolder',
  // skins (resolved + cached in the main process)
  skinGet: 'skin:get'
} as const

/** The bridge surface available to the renderer as window.mcsr. */
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
    launch(
      id: InstanceId,
      opts?: {
        importFrom?: InstanceId | null
        importFolder?: string | null
        importWorlds?: string[]
      }
    ): Promise<void>
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
    /** Import a Minecraft options.txt into this instance's standardoptions.txt.
     *  Opens a file picker; resolves the count imported, or null if cancelled. */
    importSettings(id: InstanceId): Promise<{ imported: number } | null>
    /** Instances that are installed and can be used as an import source. */
    installedIds(): Promise<InstanceId[]>
    /** Copy options.txt, hotbar.nbt, and the whole config/ folder from `source`
     *  into `target`. Resolves the list of items copied. */
    importFromInstance(
      target: InstanceId,
      source: InstanceId,
      opts?: { worlds?: string[] }
    ): Promise<{ copied: string[] }>
    /** Copy settings (and any chosen worlds) from an arbitrary folder into `target`. */
    importFromFolderPath(
      target: InstanceId,
      folder: string,
      opts?: { worlds?: string[] }
    ): Promise<{ copied: string[] }>
    /** World folder names available in an installed instance. */
    listWorlds(id: InstanceId): Promise<string[]>
    /** World folder names available in an arbitrary folder (resolving its game dir). */
    listWorldsInFolder(folder: string): Promise<string[]>
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
    /** The saved access key, so Settings can show it instead of an empty box. */
    getKey(): Promise<string | null>
    status(): Promise<TrackerStatus>
    onStatusChanged(cb: (s: TrackerStatus) => void): () => void
  }
  config: {
    get(): Promise<AppConfig>
    set(patch: Partial<AppConfig>): Promise<AppConfig>
    pickJar(): Promise<string | null>
    pickJava(): Promise<string | null>
    /** Open a folder picker; resolves the chosen path, or null if cancelled. */
    pickFolder(): Promise<string | null>
  }
  skins: {
    /** Resolve a head/body as a cached data: URL, or null if every host failed. */
    get(idOrUuid: string, size: number, kind: 'avatar' | 'body'): Promise<string | null>
  }
}

declare global {
  interface Window {
    mcsr: McsrApi
  }
}
