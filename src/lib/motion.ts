/**
 * The Opus motion system: one setting, read everywhere.
 *
 * Preference (saved in this browser, like the theme): 'auto' | 'fluid' | 'reduced' | 'off'.
 * Mode (what the page uses): 'fluid' | 'reduced' | 'off', on <html data-motion>.
 * - auto follows the operating system's prefers-reduced-motion. If, in auto, the device keeps
 *   struggling to draw frames (several seconds in a row, sampled lightly), the session settles on
 *   'reduced'. It never flips back and forth on a short stutter.
 * - An explicit choice always wins, including over the operating system.
 * The inline script in BaseLayout applies the mode before first paint; CSS reads the tokens in tokens.css.
 */
export type MotionPref = 'auto' | 'fluid' | 'reduced' | 'off';
export type MotionMode = 'fluid' | 'reduced' | 'off';

export const MOTION_KEY = 'opus.motion';
export const MOTION_SESSION_KEY = 'opus.motion.auto';

const isMode = (v: unknown): v is MotionMode => v === 'fluid' || v === 'reduced' || v === 'off';

/** The mode in effect on this page right now. Server-side (no document): 'fluid'. */
export function motion(): MotionMode {
  if (typeof document === 'undefined') return 'fluid';
  const m = document.documentElement.dataset.motion;
  return isMode(m) ? m : 'fluid';
}

/** Scale a duration (ms) for the current mode: Reduced is quicker, Off is instant. */
export function dur(ms: number, mode: MotionMode = motion()): number {
  return mode === 'off' ? 0 : mode === 'reduced' ? Math.round(ms * 0.5) : ms;
}

/** Run a callback whenever the mode changes. Returns an unsubscribe function. */
export function onMotion(fn: (m: MotionMode) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<MotionMode>).detail);
  window.addEventListener('opus:motion', h);
  return () => window.removeEventListener('opus:motion', h);
}

/** Resolve a preference to a mode (pure, for tests). */
export function resolveMotion(pref: MotionPref, osReduce: boolean, sessionAuto?: string | null): MotionMode {
  if (pref !== 'auto') return pref;
  if (osReduce) return 'reduced';
  return sessionAuto === 'reduced' ? 'reduced' : 'fluid';
}
