import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { ObsidianApi } from '../shared/ipc'
import type {
  AppConfig,
  InstanceId,
  InstanceStatus,
  LogLine,
  ProgressEvent,
  StandardSettings,
  TrackerStatus
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ObsidianApi = {
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
    launch: (id: InstanceId) => ipcRenderer.invoke(IPC.instLaunch, id),
    verify: (id: InstanceId) => ipcRenderer.invoke(IPC.instVerify, id),
    onProgress: (cb: (e: ProgressEvent) => void) => subscribe<ProgressEvent>(IPC.instProgress, cb),
    onStateChanged: (cb: (s: InstanceStatus) => void) =>
      subscribe<InstanceStatus>(IPC.instStateChanged, cb),
    mods: (id: InstanceId) => ipcRenderer.invoke(IPC.instMods, id),
    toggleMod: (id: InstanceId, file: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC.instToggleMod, id, file, enabled),
    openFolder: (id: InstanceId) => ipcRenderer.invoke(IPC.instOpenFolder, id),
    getStandardSettings: (id: InstanceId) => ipcRenderer.invoke(IPC.instStdGet, id),
    setStandardSettings: (id: InstanceId, patch: StandardSettings) =>
      ipcRenderer.invoke(IPC.instStdSet, id, patch)
  },
  system: {
    java: () => ipcRenderer.invoke(IPC.sysJava)
  },
  logs: {
    history: () => ipcRenderer.invoke(IPC.logHistory),
    clear: () => ipcRenderer.invoke(IPC.logClear),
    onLine: (cb: (line: LogLine) => void) => subscribe<LogLine>(IPC.logLine, cb)
  },
  paceman: {
    setKey: (key: string) => ipcRenderer.invoke(IPC.paceSetKey, key),
    status: () => ipcRenderer.invoke(IPC.paceStatus),
    onStatusChanged: (cb: (s: TrackerStatus) => void) =>
      subscribe<TrackerStatus>(IPC.paceStatusChanged, cb)
  },
  config: {
    get: () => ipcRenderer.invoke(IPC.cfgGet),
    set: (patch: Partial<AppConfig>) => ipcRenderer.invoke(IPC.cfgSet, patch),
    pickJar: () => ipcRenderer.invoke(IPC.cfgPickJar),
    pickJava: () => ipcRenderer.invoke(IPC.cfgPickJava)
  }
}

contextBridge.exposeInMainWorld('obsidian', api)
