import { create } from 'zustand'
import type { InstanceId, InstanceStatus, ProgressEvent } from '@shared/types'

const BUSY: InstanceStatus['state'][] = ['installing', 'launching', 'running']
export const isBusy = (s: InstanceStatus['state']): boolean => BUSY.includes(s)

interface InstancesState {
  selected: InstanceId
  statuses: Record<InstanceId, InstanceStatus>
  progress: Record<InstanceId, ProgressEvent | null>
  initialized: boolean
  select: (id: InstanceId) => void
  init: () => void
  launch: (id: InstanceId) => Promise<void>
  verify: (id: InstanceId) => Promise<void>
}

export const useInstances = create<InstancesState>((set, get) => ({
  selected: 'ranked',
  statuses: {
    ranked: { id: 'ranked', state: 'not-installed' },
    rsg: { id: 'rsg', state: 'not-installed' }
  },
  progress: { ranked: null, rsg: null },
  initialized: false,

  select: (selected) => set({ selected }),

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    void Promise.all([
      window.mcsr.instances.status('ranked'),
      window.mcsr.instances.status('rsg')
    ]).then(([ranked, rsg]) => set({ statuses: { ranked, rsg } }))

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

  launch: async (id) => {
    set({ selected: id })
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

  verify: async (id) => {
    try {
      await window.mcsr.instances.verify(id)
    } catch {
      // state stream reports the error
    }
  }
}))
