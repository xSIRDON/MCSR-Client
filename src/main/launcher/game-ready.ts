// Deciding when the game WINDOW is actually up, from the game's own stdout/stderr — so the
// launcher steps aside (minimizes) only once there's a window to step aside for, instead of the
// instant the JVM is spawned (which drops the user to an empty desktop for ~15-30s and reads as
// the client freezing).

/**
 * Log substrings Minecraft 1.16.1 (+ the MCSR mod set) emits right around the point its window
 * becomes visible. Any single match is enough. Kept broad on purpose: different mod/log configs
 * surface different lines first, so we watch several and take whichever appears.
 */
export const GAME_WINDOW_READY_MARKERS = [
  'lwjgl version', // GL/window backend created
  'openal initialized', // audio up — main menu is rendering
  'sound engine started',
  'setting user:', // session bootstrapped, render loop imminent
  'narrator' // narrator lib load, logged as the menu comes up
] as const

/** True when a chunk of the game's output shows the window has come online. */
export function gameWindowReady(output: string): boolean {
  const low = output.toLowerCase()
  return GAME_WINDOW_READY_MARKERS.some((m) => low.includes(m))
}
