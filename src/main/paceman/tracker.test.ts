import { describe, it, expect } from 'vitest'
import { trackerArgs } from './tracker'

describe('trackerArgs', () => {
  it('runs headless with the flag the tracker actually recognises', () => {
    expect(trackerArgs('t.jar', false)).toEqual(['-jar', 't.jar', '--nogui'])
  })

  it('shows its window, and exits quietly instead of prompting when a copy is already open', () => {
    expect(trackerArgs('t.jar', true)).toEqual(['-jar', 't.jar', '--noreopen'])
  })
})
