/**
 * Outer boundary extraction for panel masks, via Moore-neighbour tracing.
 *
 * Only the outer contour is produced. Holes are left for a later revision; a
 * panel outline is used for level assignment and preview, not for geometry
 * tests, so an atrium missing from the outline does not affect routing.
 */

import { simplifyPolyline } from "./simplify";
import type { BitMask } from "./types";

/** Clockwise Moore neighbourhood, starting west. */
const MOORE: readonly [number, number][] = [
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
];

/**
 * Traces the outer boundary of the single component in `mask`.
 *
 * Returns pixel-space points, simplified with `tolerancePx`. An empty array is
 * returned for an empty mask.
 */
export function traceOuterContour(mask: BitMask, tolerancePx: number): { px: number; py: number }[] {
  const { width, height, data } = mask;

  let start = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i]) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];

  const isSet = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1;

  const startX = start % width;
  const startY = (start - startX) / width;

  const contour: { px: number; py: number }[] = [];
  let x = startX;
  let y = startY;
  let backtrackDirection = 0;

  // Bounded so a pathological mask cannot spin forever.
  const maxSteps = 8 * (width + height) + data.length;

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ px: x, py: y });

    let found = false;
    for (let k = 1; k <= 8; k++) {
      const direction = (backtrackDirection + k) % 8;
      const nx = x + MOORE[direction][0];
      const ny = y + MOORE[direction][1];
      if (!isSet(nx, ny)) continue;

      // Re-enter from the neighbour opposite to where we came from.
      backtrackDirection = (direction + 5) % 8;
      x = nx;
      y = ny;
      found = true;
      break;
    }

    if (!found) break;
    if (x === startX && y === startY && contour.length > 2) break;
  }

  return simplifyPolyline(contour, tolerancePx);
}
