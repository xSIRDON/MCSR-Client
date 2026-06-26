import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { ObsidianApi } from '../shared/ipc'
import type {
  AppConfig,
  InstanceId,
  InstanceStatus,
  ProgressEvent,
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
    logout: () => ipcRenderer.invoke(IPC.authLogout)
  },
  instances: {
    status: (id: InstanceId) => ipcRenderer.invoke(IPC.instStatus, id),
    install: (id: InstanceId) => ipcRenderer.invoke(IPC.instInstall, id),
    launch: (id: InstanceId) => ipcRenderer.invoke(IPC.instLaunch, id),
    verify: (id: InstanceId) => ipcRenderer.invoke(IPC.instVerify, id),
    onProgress: (cb: (e: ProgressEvent) => void) => subscribe<ProgressEvent>(IPC.instProgress, cb),
    onStateChanged: (cb: (s: InstanceStatus) => void) =>
      subscribe<InstanceStatus>(IPC.instStateChanged, cb)
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
    pickJar: () => ipcRenderer.invoke(IPC.cfgPickJar)
  }
}

contextBridge.exposeInMainWorld('obsidian', api)
