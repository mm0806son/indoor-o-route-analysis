/**
 * Zhang–Suen thinning.
 *
 * The algorithm is fixed rather than chosen at runtime: Guo–Hall and
 * ridge-following medial axes produce different junction topology on the same
 * mask, so the node counts the parameter defaults were tuned against would not
 * transfer between them.
 */

import { cloneMask } from "./morphology";
import type { BitMask } from "./types";

/** Neighbour offsets P2..P9 in Zhang–Suen order (N, NE, E, SE, S, SW, W, NW). */
const NEIGHBOURS: readonly [number, number][] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function readNeighbours(mask: BitMask, x: number, y: number, out: Uint8Array): void {
  const { width, height, data } = mask;
  for (let i = 0; i < 8; i++) {
    const nx = x + NEIGHBOURS[i][0];
    const ny = y + NEIGHBOURS[i][1];
    out[i] = nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : data[ny * width + nx];
  }
}

/** Number of set neighbours (B in the original paper). */
function neighbourCount(n: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += n[i];
  return sum;
}

/** Number of 0→1 transitions walking the neighbourhood clockwise (A). */
function transitionCount(n: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if (n[i] === 0 && n[(i + 1) % 8] === 1) count++;
  }
  return count;
}

/**
 * Thins a mask to an 8-connected one-pixel-wide skeleton.
 *
 * Iterates two complementary sub-passes until no pixel changes. Each sub-pass
 * removes only contour pixels whose deletion cannot break connectivity
 * (`transitionCount === 1`) nor erase an endpoint (`neighbourCount >= 2`).
 */
export function skeletonize(input: BitMask): BitMask {
  const mask = cloneMask(input);
  const { width, height, data } = mask;
  const n = new Uint8Array(8);
  const doomed: number[] = [];

  let changed = true;
  while (changed) {
    changed = false;

    for (let step = 0; step < 2; step++) {
      doomed.length = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = y * width + x;
          if (!data[p]) continue;

          readNeighbours(mask, x, y, n);
          const b = neighbourCount(n);
          if (b < 2 || b > 6) continue;
          if (transitionCount(n) !== 1) continue;

          // n indices 0,2,4,6 are P2 (N), P4 (E), P6 (S), P8 (W).
          const north = n[0];
          const east = n[2];
          const south = n[4];
          const west = n[6];
          if (step === 0) {
            if (north * east * south !== 0) continue;
            if (east * south * west !== 0) continue;
          } else {
            if (north * east * west !== 0) continue;
            if (north * south * west !== 0) continue;
          }

          doomed.push(p);
        }
      }

      if (doomed.length > 0) {
        for (const p of doomed) data[p] = 0;
        changed = true;
      }
    }
  }

  return mask;
}

/** Counts set 8-neighbours of every skeleton pixel. */
export function neighbourDegrees(mask: BitMask): Uint8Array {
  const { width, height, data } = mask;
  const degrees = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!data[p]) continue;

      let count = 0;
      for (let i = 0; i < 8; i++) {
        const nx = x + NEIGHBOURS[i][0];
        const ny = y + NEIGHBOURS[i][1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        count += data[ny * width + nx];
      }
      degrees[p] = count;
    }
  }

  return degrees;
}
