export const GAME_WINDOW_READY_MARKERS = [
  'lwjgl version',
  'openal initialized',
  'sound engine started',
  'setting user:',
  'narrator'
] as const

export function gameWindowReady(output: string): boolean {
  const low = output.toLowerCase()
  return GAME_WINDOW_READY_MARKERS.some((m) => low.includes(m))
}
