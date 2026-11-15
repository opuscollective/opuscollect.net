/**
 * Keeps the Motion setting in effect after first paint (the inline script in BaseLayout applies it before).
 * - Auto follows the device's reduced-motion setting live.
 * - Another tab changing the setting applies here too.
 * - In Auto, a light frame-time check watches the first half-minute of a visit: only if frames stay slow
 *   for several seconds in a row does this session settle on Reduced. It never switches back and forth.
 */
import { MOTION_KEY, MOTION_SESSION_KEY, resolveMotion, type MotionMode, type MotionPref } from '@/lib/motion';

const os = () => matchMedia('(prefers-reduced-motion: reduce)');
const isPref = (v: unknown): v is MotionPref => v === 'auto' || v === 'fluid' || v === 'reduced' || v === 'off';

export function getMotionPref(): MotionPref {
  try { const v = localStorage.getItem(MOTION_KEY); if (isPref(v)) return v; } catch { /* storage blocked */ }
  return 'auto';
}
const sessionAuto = () => { try { return sessionStorage.getItem(MOTION_SESSION_KEY); } catch { return null; } };

function apply(p: MotionPref) {
  const d = document.documentElement;
  const m: MotionMode = resolveMotion(p, os().matches, sessionAuto());
  const changed = d.dataset.motion !== m;
  d.dataset.motion = m; d.dataset.motionPref = p;
  document.querySelectorAll<HTMLElement>('[data-motion-value]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.motionValue === p)));
  if (changed) window.dispatchEvent(new CustomEvent<MotionMode>('opus:motion', { detail: m }));
}

export function setMotionPref(p: MotionPref) {
  try { if (p === 'auto') localStorage.removeItem(MOTION_KEY); else localStorage.setItem(MOTION_KEY, p); } catch { /* applied, not saved */ }
  apply(p);
}

/** Sustained slow frames: median frame time over 40ms (under 25 fps) in 3 consecutive 2-second windows. */
function watchFrames() {
  if (getMotionPref() !== 'auto' || document.documentElement.dataset.motion !== 'fluid' || sessionAuto()) return;
  let last = 0, frames: number[] = [], windowStart = 0, slow = 0, raf = 0;
  const stopAt = performance.now() + 30_000;
  const tick = (t: number) => {
    if (document.hidden) { last = 0; raf = requestAnimationFrame(tick); return; } // hidden tabs throttle rAF; don't count it
    if (last) frames.push(t - last);
    last = t;
    if (!windowStart) windowStart = t;
    if (t - windowStart >= 2000) {
      const sorted = frames.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      slow = median > 40 ? slow + 1 : 0;
      frames = []; windowStart = t;
      if (slow >= 3) {
        try { sessionStorage.setItem(MOTION_SESSION_KEY, 'reduced'); } catch { /* not kept */ }
        apply('auto');
        return;
      }
    }
    if (t < stopAt && getMotionPref() === 'auto') raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
}

let started = false;
export function initMotion() {
  if (started) return;
  started = true;
  os().addEventListener('change', () => { if (getMotionPref() === 'auto') apply('auto'); });
  addEventListener('storage', (e) => { if (e.key === MOTION_KEY) apply(getMotionPref()); });
  apply(getMotionPref());
  watchFrames();
}
