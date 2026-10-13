// Runs GMLL's install in its own process (an Electron utilityProcess).
//
// GMLL checks every asset and library by reading and hashing it synchronously — seconds of work on
// an existing install, more on a fresh one. Run in the main process, that blocked the thread that
// draws the window, so the client stopped responding for the whole install. Here it only blocks this
// process; the main process relays progress and stays responsive.

import { init, config, Instance } from 'gmll'
import { cleanError } from './install-errors'

interface Job {
  root: string
  instances: string
  id: string
  version: string
  path: string
  ram: number
}

export type WorkerMessage =
  | { type: 'progress'; index: number; total: number }
  | { type: 'setup' }
  | { type: 'done' }
  | { type: 'error'; message: string }

const port = process.parentPort
const send = (m: WorkerMessage): void => port.postMessage(m)

port.once('message', async (e) => {
  const job = e.data as Job
  try {
    config.setRoot(job.root)
    config.setInstances(job.instances)
    config.setLauncherName('MCSR Client')
    const ev = config.getEventListener()
    ev.on('download.progress', (_key: string, index: number, total: number) =>
      send({ type: 'progress', index, total })
    )
    ev.on('download.setup', () => send({ type: 'setup' }))
    await init()
    const inst = new Instance({ name: job.id, version: job.version, path: job.path, ram: job.ram })
    await inst.install()
    send({ type: 'done' })
  } catch (err) {
    send({ type: 'error', message: cleanError(err) })
  }
})

