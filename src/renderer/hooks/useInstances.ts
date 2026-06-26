import { create } from 'zustand'
import type { InstanceId, InstanceStatus, ProgressEvent } from '@shared/types'

const BUSY: InstanceStatus['state'][] = ['installing', 'launching', 'running']
export const isBusy = (s: InstanceStatus['state']): boolean => BUSY.includes(s)

interface InstancesState {
  selected: InstanceId
  statuses: Record<InstanceId, InstanceStatus>
  progress: Record<InstanceId, ProgressEvent | null>
  initialized: boolean
  /** Instance awaiting the pre-install map picker, or null. */
  installPrompt: InstanceId | null
  select: (id: InstanceId) => void
  init: () => void
  launch: (id: InstanceId) => Promise<void>
  proceedLaunch: (id: InstanceId) => Promise<void>
  cancelInstall: () => void
  verify: (id: InstanceId) => Promise<void>
}

export const useInstances = create<InstancesState>((set, get) => ({
  selected: 'ranked',
  statuses: {
    ranked: { id: 'ranked', state: 'not-installed' },
    rsg: { id: 'rsg', state: 'not-installed' },
    zsg: { id: 'zsg', state: 'not-installed' }
  },
  progress: { ranked: null, rsg: null, zsg: null },
  initialized: false,
  installPrompt: null,

  select: (selected) => set({ selected }),

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    void Promise.all([
      window.mcsr.instances.status('ranked'),
      window.mcsr.instances.status('rsg'),
      window.mcsr.instances.status('zsg')
    ]).then(([ranked, rsg, zsg]) => set({ statuses: { ranked, rsg, zsg } }))

    window.mcsr.instances.onStateChanged((s) =>
      set((prev) => {
        const progress = isBusy(s.state) ? prev.progress : { ...prev.progress, [s.id]: null }
        return { statuses: { ...prev.statuses, [s.id]: s }, progress }
      })
    )
    window.mcsr.instances.onProgress((e) =>
      set((prev) => ({ progress: { ...prev.progress, [e.instance]: e } }))
    )
  },

  // First-time install? Pop the map picker; otherwise go straight to launch.
  launch: async (id) => {
    set({ selected: id })
    if (get().statuses[id].state === 'not-installed') {
      set({ installPrompt: id })
      return
    }
    await get().proceedLaunch(id)
  },

  proceedLaunch: async (id) => {
    set({ selected: id, installPrompt: null })
    try {
      await window.mcsr.instances.launch(id)
    } catch (e) {
      set((prev) => ({
        statuses: {
          ...prev.statuses,
          [id]: { ...prev.statuses[id], state: 'error', error: String(e) }
        }
      }))
    }
  },

  cancelInstall: () => set({ installPrompt: null }),

  verify: async (id) => {
    try {
      await window.mcsr.instances.verify(id)
    } catch {
      // state stream reports the error
    }
  }
}))
