import { spawn } from 'node:child_process'
import { expect, it } from 'vitest'
import { waitForPrismStart } from './prism-start'

it('recognizes the Java entry point split across output chunks', async () => {
  const child = spawn(process.execPath, ['-e', "process.stdout.write('org.prism'); setTimeout(() => process.stdout.write('launcher.EntryPoint'), 30); setInterval(()=>{},1000)"], { stdio: 'pipe', windowsHide: true })
  try { await expect(waitForPrismStart(child, 3000)).resolves.toBeUndefined() }
  finally { child.kill() }
})

it('reports an early exit instead of claiming Minecraft started', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(1)'], { stdio: 'pipe', windowsHide: true })
  await expect(waitForPrismStart(child, 3000)).rejects.toThrow(/before Minecraft started/)
})

it('stops an invisible stalled launcher and reports a timeout', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'pipe', windowsHide: true })
  await expect(waitForPrismStart(child, 100)).rejects.toThrow(/did not start Minecraft/)
  expect(child.killed).toBe(true)
})
