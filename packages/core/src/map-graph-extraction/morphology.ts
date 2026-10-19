/**
 * Binary morphology primitives over {@link BitMask}.
 *
 * Dilation and erosion are expressed through an exact Euclidean distance
 * transform rather than repeated structuring-element passes. That makes their
 * cost independent of the radius, which matters because radii here are derived
 * from metres and can be tens of pixels at higher working resolutions.
 */

import type { BitMask } from "./types";

export function createMask(width: number, height: number, fill = 0): BitMask {
  const data = new Uint8Array(width * height);
  if (fill) data.fill(1);
  return { width, height, data };
}

export function cloneMask(mask: BitMask): BitMask {
  return { width: mask.width, height: mask.height, data: Uint8Array.from(mask.data) };
}

export function countMask(mask: BitMask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) n += mask.data[i];
  return n;
}

export interface CroppedMask {
  mask: BitMask;
  offsetX: number;
  offsetY: number;
}

/**
 * Crops a mask to the bounding box of its set pixels, with a one-pixel margin.
 *
 * Thinning is iterative and rescans its whole input every pass, so running it
 * over the full page for each panel costs the page area times the panel count.
 * A panel typically occupies a small fraction of the page, and cropping turns
 * that product back into roughly the total free-space area.
 */
export function cropToContent(mask: BitMask): CroppedMask | undefined {
  const { width, height, data } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!data[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return undefined;

  const offsetX = Math.max(0, minX - 1);
  const offsetY = Math.max(0, minY - 1);
  const cropWidth = Math.min(width, maxX + 2) - offsetX;
  const cropHeight = Math.min(height, maxY + 2) - offsetY;

  const cropped = createMask(cropWidth, cropHeight);
  for (let y = 0; y < cropHeight; y++) {
    const src = (y + offsetY) * width + offsetX;
    const dst = y * cropWidth;
    for (let x = 0; x < cropWidth; x++) cropped.data[dst + x] = data[src + x];
  }

  return { mask: cropped, offsetX, offsetY };
}

const INF = 1e20;

/**
 * One-dimensional squared distance transform of a sampled function
 * (Felzenszwalb & Huttenlocher 2012). Used as the separable inner pass of the
 * 2-D transform below.
 */
function distanceTransform1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dist = q - v[k];
    d[q] = dist * dist + f[v[k]];
  }
}

/**
 * Exact Euclidean distance from every pixel to the nearest set pixel of `mask`.
 * Pixels that are themselves set have distance 0.
 */
export function distanceTransform(mask: BitMask): Float64Array {
  const { width, height, data } = mask;
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = data[i] ? 0 : INF;

  const maxDim = Math.max(width, height);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    distanceTransform1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = grid[row + x];
    distanceTransform1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[row + x] = Math.sqrt(d[x]);
  }

  return grid;
}

/** Distance from every set pixel to the nearest unset pixel ("clearance"). */
export function clearanceTransform(mask: BitMask): Float64Array {
  const inverted: BitMask = {
    width: mask.width,
    height: mask.height,
    data: mask.data.map((v) => (v ? 0 : 1)) as Uint8Array,
  };
  return distanceTransform(inverted);
}

/** Grows the set region by `radius` pixels. */
export function dilate(mask: BitMask, radius: number): BitMask {
  if (radius <= 0) return cloneMask(mask);
  const dist = distanceTransform(mask);
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = dist[i] <= radius ? 1 : 0;
  return out;
}

/** Shrinks the set region by `radius` pixels. */
export function erode(mask: BitMask, radius: number): BitMask {
  if (radius <= 0) return cloneMask(mask);
  const dist = clearanceTransform(mask);
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = mask.data[i] && dist[i] > radius ? 1 : 0;
  return out;
}

/** Dilation followed by erosion: closes gaps narrower than `2 × radius`. */
export function closing(mask: BitMask, radius: number): BitMask {
  return erode(dilate(mask, radius), radius);
}

/** Erosion followed by dilation: removes protrusions narrower than `2 × radius`. */
export function opening(mask: BitMask, radius: number): BitMask {
  return dilate(erode(mask, radius), radius);
}

export interface ComponentLabels {
  /** Component index per pixel, 0 meaning background. */
  labels: Int32Array;
  /** Pixel count per component; index 0 is unused. */
  sizes: number[];
  count: number;
}

/**
 * Labels 4-connected components of the set region.
 *
 * 4-connectivity rather than 8 is deliberate: under 8-connectivity two rooms
 * touching only at a diagonal pixel — common where a wall meets a corner — would
 * merge into one panel.
 */
export function connectedComponents(mask: BitMask): ComponentLabels {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height);
  const sizes: number[] = [0];
  const stack: number[] = [];
  let count = 0;

  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start]) continue;

    count++;
    let size = 0;
    stack.push(start);
    labels[start] = count;

    while (stack.length > 0) {
      const p = stack.pop() as number;
      size++;
      const x = p % width;
      const y = (p - x) / width;

      if (x > 0 && data[p - 1] && !labels[p - 1]) {
        labels[p - 1] = count;
        stack.push(p - 1);
      }
      if (x + 1 < width && data[p + 1] && !labels[p + 1]) {
        labels[p + 1] = count;
        stack.push(p + 1);
      }
      if (y > 0 && data[p - width] && !labels[p - width]) {
        labels[p - width] = count;
        stack.push(p - width);
      }
      if (y + 1 < height && data[p + width] && !labels[p + width]) {
        labels[p + width] = count;
        stack.push(p + width);
      }
    }

    sizes.push(size);
  }

  return { labels, sizes, count };
}

/** Drops set components smaller than `minArea` pixels. */
export function removeSmallObjects(mask: BitMask, minArea: number): BitMask {
  const { labels, sizes } = connectedComponents(mask);
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) {
    const label = labels[i];
    out.data[i] = label && sizes[label] >= minArea ? 1 : 0;
  }
  return out;
}

/**
 * Fills unset components smaller than `maxArea` pixels.
 *
 * Components touching the image border are never filled: they are outside
 * space, not enclosed holes.
 */
export function removeSmallHoles(mask: BitMask, maxArea: number): BitMask {
  const { width, height } = mask;
  const inverted: BitMask = {
    width,
    height,
    data: mask.data.map((v) => (v ? 0 : 1)) as Uint8Array,
  };
  const { labels, sizes } = connectedComponents(inverted);

  const touchesBorder = new Set<number>();
  for (let x = 0; x < width; x++) {
    if (labels[x]) touchesBorder.add(labels[x]);
    const bottom = (height - 1) * width + x;
    if (labels[bottom]) touchesBorder.add(labels[bottom]);
  }
  for (let y = 0; y < height; y++) {
    const left = y * width;
    if (labels[left]) touchesBorder.add(labels[left]);
    const right = left + width - 1;
    if (labels[right]) touchesBorder.add(labels[right]);
  }

  const out = cloneMask(mask);
  for (let i = 0; i < out.data.length; i++) {
    const label = labels[i];
    if (label && !touchesBorder.has(label) && sizes[label] <= maxArea) {
      out.data[i] = 1;
    }
  }
  return out;
}
