import type {
  Account,
  AppConfig,
  FriendMessage,
  FriendsNetState,
  InstanceId,
  InstanceStatus,
  JavaInfo,
  LogLine,
  MessagesEvent,
  MessageStore,
  ModInfo,
  Profile,
  GapCheckCounts,
  GapCheckFilters,
  GapCheckSeed,
  ProgressEvent,
  SeedQueueInfo,
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
  instExtraOptionsPrompt: 'inst:extraOptionsPrompt',
  instAddExtraOptions: 'inst:addExtraOptions',
  instDismissExtraOptionsPrompt: 'inst:dismissExtraOptionsPrompt',
  instOpenFolder: 'inst:openFolder',
  instExport: 'inst:export',
  instStdGet: 'inst:stdGet',
  instStdSet: 'inst:stdSet',
  instImportSettings: 'inst:importSettings',
  instImportFromInstance: 'inst:importFromInstance',
  instImportFromFolderPath: 'inst:importFromFolderPath',
  instInstalledIds: 'inst:installedIds',
  instListWorlds: 'inst:listWorlds',
  instListWorldsInFolder: 'inst:listWorldsInFolder',
  instSeedQueue: 'inst:seedQueue',
  instTuneSeedQueue: 'inst:tuneSeedQueue',
  gapcheckCounts: 'gapcheck:counts',
  gapcheckSeed: 'gapcheck:seed',
  sysJava: 'sys:java',
  updCheck: 'upd:check',
  updStatus: 'upd:status',
  updInstall: 'upd:install',
  updStatusChanged: 'upd:statusChanged',
  logLine: 'log:line',
  logHistory: 'log:history',
  logClear: 'log:clear',
  paceSetKey: 'pace:setKey',
  paceGetKey: 'pace:getKey',
  paceStatus: 'pace:status',
  paceStatusChanged: 'pace:statusChanged',
  friendsState: 'friends:state',
  friendsAutoConnect: 'friends:autoConnect',
  friendsConnect: 'friends:connect',
  friendsDisconnect: 'friends:disconnect',
  friendsRequest: 'friends:request',
  friendsAccept: 'friends:accept',
  friendsDecline: 'friends:decline',
  friendsRemove: 'friends:remove',
  friendsChanged: 'friends:changed',
  friendsMessages: 'friends:messages',
  friendsSendMessage: 'friends:sendMessage',
  friendsMarkRead: 'friends:markRead',
  friendsMessagesChanged: 'friends:messagesChanged',
  cfgGet: 'cfg:get',
  cfgSet: 'cfg:set',
  cfgPickJar: 'cfg:pickJar',
  cfgPickJava: 'cfg:pickJava',
  cfgPickFolder: 'cfg:pickFolder',
  skinGet: 'skin:get',
  matchCacheGet: 'matchCache:get',
  matchCachePut: 'matchCache:put'
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
    extraOptionsPrompt(): Promise<{ show: boolean; instances: InstanceId[] }>
    addExtraOptions(instances: InstanceId[]): Promise<void>
    dismissExtraOptionsPrompt(): Promise<void>
    openFolder(id: InstanceId): Promise<void>
    exportPack(id: InstanceId): Promise<string | null>
    getStandardSettings(id: InstanceId): Promise<StandardSettings>
    setStandardSettings(id: InstanceId, patch: StandardSettings): Promise<StandardSettings>
    importSettings(id: InstanceId): Promise<{ imported: number } | null>
    installedIds(): Promise<InstanceId[]>
    importFromInstance(
      target: InstanceId,
      source: InstanceId,
      opts?: { worlds?: string[] }
    ): Promise<{ copied: string[] }>
    importFromFolderPath(
      target: InstanceId,
      folder: string,
      opts?: { worlds?: string[] }
    ): Promise<{ copied: string[] }>
    listWorlds(id: InstanceId): Promise<string[]>
    listWorldsInFolder(folder: string): Promise<string[]>
    seedQueue(id: InstanceId): Promise<SeedQueueInfo | null>
    tuneSeedQueue(id: InstanceId): Promise<SeedQueueInfo | null>
  }
  gapcheck: {
    counts(filters: GapCheckFilters): Promise<GapCheckCounts>
    seed(filters: GapCheckFilters): Promise<GapCheckSeed | null>
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
    getKey(): Promise<string | null>
    status(): Promise<TrackerStatus>
    onStatusChanged(cb: (s: TrackerStatus) => void): () => void
  }
  friends: {
    state(): Promise<FriendsNetState>
    autoConnect(): Promise<FriendsNetState>
    connect(): Promise<FriendsNetState>
    disconnect(): Promise<FriendsNetState>
    request(uuid: string, nickname?: string): Promise<FriendsNetState>
    accept(uuid: string): Promise<FriendsNetState>
    decline(uuid: string): Promise<FriendsNetState>
    remove(uuid: string): Promise<FriendsNetState>
    onChanged(cb: (s: FriendsNetState) => void): () => void
    messages(): Promise<MessageStore>
    sendMessage(uuid: string, body: string): Promise<FriendMessage | null>
    markRead(uuid: string): Promise<void>
    onMessages(cb: (e: MessagesEvent) => void): () => void
  }
  config: {
    get(): Promise<AppConfig>
    set(patch: Partial<AppConfig>): Promise<AppConfig>
    pickJar(): Promise<string | null>
    pickJava(): Promise<string | null>
    pickFolder(): Promise<string | null>
  }
  skins: {
    get(idOrUuid: string, size: number, kind: 'avatar' | 'body'): Promise<string | null>
  }
  matchCache: {
    get(id: number): Promise<unknown | null>
    put(id: number, match: unknown): Promise<void>
  }
}

declare global {
  interface Window {
    mcsr: McsrApi
  }
}
