import { describe, expect, it } from 'vitest'
import { ipcMessage } from './ipc-error'

describe('ipcMessage', () => {
  it('strips the Electron IPC wrapper', () => {
    const e = new Error("Error invoking remote method 'inst:launch': Error: Sign in first.")
    expect(ipcMessage(e, 'x')).toBe('Sign in first.')
  })
  it('falls back for empty or unknown errors', () => {
    expect(ipcMessage(null, 'Could not launch.')).toBe('Could not launch.')
  })
})
