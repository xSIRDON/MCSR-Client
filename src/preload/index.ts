import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { McsrApi } from '../shared/ipc'
import type {
  AppConfig,
  FriendsNetState,
  InstanceId,
  InstanceStatus,
  LogLine,
  MessagesEvent,
  ProgressEvent,
  StandardSettings,
  TrackerStatus,
  UpdateStatus
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: McsrApi = {
  window: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    close: () => ipcRenderer.send(IPC.winClose)
  },
  auth: {
    login: () => ipcRenderer.invoke(IPC.authLogin),
    restore: () => ipcRenderer.invoke(IPC.authRestore),
    logout: () => ipcRenderer.invoke(IPC.authLogout),
    accounts: () => ipcRenderer.invoke(IPC.authAccounts),
    add: () => ipcRenderer.invoke(IPC.authAdd),
    switch: (uuid: string) => ipcRenderer.invoke(IPC.authSwitch, uuid),
    remove: (uuid: string) => ipcRenderer.invoke(IPC.authRemove, uuid)
  },
  instances: {
    status: (id: InstanceId) => ipcRenderer.invoke(IPC.instStatus, id),
    install: (id: InstanceId) => ipcRenderer.invoke(IPC.instInstall, id),
    launch: (
      id: InstanceId,
      opts?: { importFrom?: InstanceId | null; importFolder?: string | null; importWorlds?: string[] }
    ) => ipcRenderer.invoke(IPC.instLaunch, id, opts),
    verify: (id: InstanceId) => ipcRenderer.invoke(IPC.instVerify, id),
    delete: (id: InstanceId) => ipcRenderer.invoke(IPC.instDelete, id),
    syncMaps: (id: InstanceId) => ipcRenderer.invoke(IPC.instSyncMaps, id),
    onProgress: (cb: (e: ProgressEvent) => void) => subscribe<ProgressEvent>(IPC.instProgress, cb),
    onStateChanged: (cb: (s: InstanceStatus) => void) =>
      subscribe<InstanceStatus>(IPC.instStateChanged, cb),
    mods: (id: InstanceId) => ipcRenderer.invoke(IPC.instMods, id),
    toggleMod: (id: InstanceId, file: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC.instToggleMod, id, file, enabled),
    openFolder: (id: InstanceId) => ipcRenderer.invoke(IPC.instOpenFolder, id),
    getStandardSettings: (id: InstanceId) => ipcRenderer.invoke(IPC.instStdGet, id),
    setStandardSettings: (id: InstanceId, patch: StandardSettings) =>
      ipcRenderer.invoke(IPC.instStdSet, id, patch),
    importSettings: (id: InstanceId) => ipcRenderer.invoke(IPC.instImportSettings, id),
    installedIds: () => ipcRenderer.invoke(IPC.instInstalledIds),
    importFromInstance: (target: InstanceId, source: InstanceId, opts?: { worlds?: string[] }) =>
      ipcRenderer.invoke(IPC.instImportFromInstance, target, source, opts),
    importFromFolderPath: (target: InstanceId, folder: string, opts?: { worlds?: string[] }) =>
      ipcRenderer.invoke(IPC.instImportFromFolderPath, target, folder, opts),
    listWorlds: (id: InstanceId) => ipcRenderer.invoke(IPC.instListWorlds, id),
    listWorldsInFolder: (folder: string) => ipcRenderer.invoke(IPC.instListWorldsInFolder, folder)
  },
  system: {
    java: () => ipcRenderer.invoke(IPC.sysJava)
  },
  updater: {
    check: () => ipcRenderer.invoke(IPC.updCheck),
    status: () => ipcRenderer.invoke(IPC.updStatus),
    install: () => ipcRenderer.invoke(IPC.updInstall),
    onStatusChanged: (cb: (s: UpdateStatus) => void) =>
      subscribe<UpdateStatus>(IPC.updStatusChanged, cb)
  },
  logs: {
    history: () => ipcRenderer.invoke(IPC.logHistory),
    clear: () => ipcRenderer.invoke(IPC.logClear),
    onLine: (cb: (line: LogLine) => void) => subscribe<LogLine>(IPC.logLine, cb)
  },
  paceman: {
    setKey: (key: string) => ipcRenderer.invoke(IPC.paceSetKey, key),
    getKey: () => ipcRenderer.invoke(IPC.paceGetKey),
    status: () => ipcRenderer.invoke(IPC.paceStatus),
    onStatusChanged: (cb: (s: TrackerStatus) => void) =>
      subscribe<TrackerStatus>(IPC.paceStatusChanged, cb)
  },
  friends: {
    state: () => ipcRenderer.invoke(IPC.friendsState),
    autoConnect: () => ipcRenderer.invoke(IPC.friendsAutoConnect),
    connect: () => ipcRenderer.invoke(IPC.friendsConnect),
    disconnect: () => ipcRenderer.invoke(IPC.friendsDisconnect),
    request: (uuid: string, nickname?: string) =>
      ipcRenderer.invoke(IPC.friendsRequest, uuid, nickname),
    accept: (uuid: string) => ipcRenderer.invoke(IPC.friendsAccept, uuid),
    decline: (uuid: string) => ipcRenderer.invoke(IPC.friendsDecline, uuid),
    remove: (uuid: string) => ipcRenderer.invoke(IPC.friendsRemove, uuid),
    onChanged: (cb: (s: FriendsNetState) => void) =>
      subscribe<FriendsNetState>(IPC.friendsChanged, cb),
    messages: () => ipcRenderer.invoke(IPC.friendsMessages),
    sendMessage: (uuid: string, body: string) =>
      ipcRenderer.invoke(IPC.friendsSendMessage, uuid, body),
    markRead: (uuid: string) => ipcRenderer.invoke(IPC.friendsMarkRead, uuid),
    onMessages: (cb: (e: MessagesEvent) => void) =>
      subscribe<MessagesEvent>(IPC.friendsMessagesChanged, cb)
  },
  config: {
    get: () => ipcRenderer.invoke(IPC.cfgGet),
    set: (patch: Partial<AppConfig>) => ipcRenderer.invoke(IPC.cfgSet, patch),
    pickJar: () => ipcRenderer.invoke(IPC.cfgPickJar),
    pickJava: () => ipcRenderer.invoke(IPC.cfgPickJava),
    pickFolder: () => ipcRenderer.invoke(IPC.cfgPickFolder)
  },
  skins: {
    get: (idOrUuid: string, size: number, kind: 'avatar' | 'body') =>
      ipcRenderer.invoke(IPC.skinGet, idOrUuid, size, kind)
  }
}

contextBridge.exposeInMainWorld('mcsr', api)
