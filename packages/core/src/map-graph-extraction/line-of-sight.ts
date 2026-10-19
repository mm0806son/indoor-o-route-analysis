/**
 * Line-of-sight tests over the free-space mask.
 *
 * Used both to keep a control from snapping onto a corridor on the far side of a
 * wall, and to check the invariant the design states for every emitted edge: a
 * generated edge must not run through blocked pixels.
 */

import type { BitMask } from "./types";

/**
 * Longest unbroken run of non-free pixels along the segment `a`–`b`.
 *
 * A short run is normal and expected: the segment is a straight chord across a
 * corridor that bends, or it clips a doorway jamb by a pixel. A long run means
 * the segment passes through something solid.
 */
export function longestBlockedRun(
  free: BitMask,
  a: { px: number; py: number },
  b: { px: number; py: number },
): number {
  const dx = b.px - a.px;
  const dy = b.py - a.py;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));

  let longest = 0;
  let run = 0;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(a.px + dx * t);
    const y = Math.round(a.py + dy * t);

    const inside = x >= 0 && y >= 0 && x < free.width && y < free.height;
    if (inside && free.data[y * free.width + x]) {
      run = 0;
      continue;
    }

    run++;
    if (run > longest) longest = run;
  }

  return longest;
}

/** True when the segment stays inside free space but for runs of `toleratePx`. */
export function hasLineOfSight(
  free: BitMask,
  a: { px: number; py: number },
  b: { px: number; py: number },
  toleratePx: number,
): boolean {
  return longestBlockedRun(free, a, b) <= toleratePx;
}
