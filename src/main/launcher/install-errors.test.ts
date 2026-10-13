import { describe, it, expect } from 'vitest'
import { cleanError } from './install-errors'

describe('cleanError', () => {
  it('strips the terminal colours and ERROR banner from GMLL errors, keeping the message', () => {
    // Shape of a real GMLL error string.
    const raw =
      '\n\n\u001b[31m\u001b[1m[--------------ERROR--------------ERROR--------------!GMLL!--------------ERROR--------------ERROR--------------]\u001b[0m\n\nUnknown version, please check spelling of given version ID\n\n'
    expect(cleanError(raw)).toBe('Unknown version, please check spelling of given version ID')
  })

  it('passes ordinary errors through', () => {
    expect(cleanError(new Error('EPERM, Permission denied'))).toBe('EPERM, Permission denied')
  })

  it('never returns an empty message', () => {
    expect(cleanError('')).toBe('The installer failed.')
  })
})
