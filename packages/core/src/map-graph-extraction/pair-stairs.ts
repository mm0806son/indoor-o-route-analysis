/**
 * Pairs stair candidates across floors by the shape of their letter labels.
 *
 * Every staircase carries a letter (`603.1 Trappbokstav`) repeated on each floor
 * it reaches, so two stairs bearing the same letter are the same staircase. What
 * matters is only whether two glyphs are *the same*, never which letter they
 * are, so no character recognition is involved: the label is cut out, normalised
 * onto a small grid, and compared pixel for pixel.
 *
 * That distinction is what makes this safe enough to automate. A misread letter
 * would silently connect the wrong storeys; a mismatched glyph produces a low
 * similarity score, which is reported and can be reviewed.
 */

import { connectedComponents } from "./morphology";
import { maskForRoles } from "./palette";
import type { StairBlob } from "./stairs";

/** A normalised bitmap of one stair's letter label. */
export interface GlyphSignature {
  /** Row-major `size * size` samples in [0, 1]. */
  cells: Float64Array;
  size: number;
  /** Pixel area of the glyph before normalisation, for a sanity check. */
  areaPx: number;
}

export interface GlyphOptions {
  /** Half-width of the window searched around a stair, in pixels. */
  searchRadiusPx: number;
  /** Glyph blobs smaller than this are noise. */
  minGlyphAreaPx: number;
  /** Glyph blobs larger than this are barrier tape, not a letter. */
  maxGlyphAreaPx: number;
  /** Resolution of the normalised grid. */
  size: number;
}

/**
 * Cuts the letter label nearest to `stair` out of the barrier-role pixels.
 *
 * The label is drawn in the same violet as barrier tape, so candidates are
 * filtered by size: a letter is a compact blob of a few dozen pixels, tape runs
 * for hundreds.
 */
export function extractGlyph(
  classMap: Uint8Array,
  width: number,
  height: number,
  stair: StairBlob,
  options: GlyphOptions,
): GlyphSignature | undefined {
  const violet = maskForRoles(classMap, width, height, ["barrier"]);

  const x0 = Math.max(0, Math.round(stair.px - options.searchRadiusPx));
  const x1 = Math.min(width - 1, Math.round(stair.px + options.searchRadiusPx));
  const y0 = Math.max(0, Math.round(stair.py - options.searchRadiusPx));
  const y1 = Math.min(height - 1, Math.round(stair.py + options.searchRadiusPx));
  if (x1 <= x0 || y1 <= y0) return undefined;

  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const window = { width: w, height: h, data: new Uint8Array(w * h) };
  for (let y = 0; y < h; y++) {
    const src = (y + y0) * width + x0;
    for (let x = 0; x < w; x++) window.data[y * w + x] = violet.data[src + x];
  }

  const { labels, sizes, count } = connectedComponents(window);

  let bestLabel = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  const bounds = new Map<number, { minX: number; maxX: number; minY: number; maxY: number; sx: number; sy: number }>();

  for (let p = 0; p < labels.length; p++) {
    const label = labels[p];
    if (!label) continue;
    const x = p % w;
    const y = (p - x) / w;
    let b = bounds.get(label);
    if (!b) {
      b = { minX: x, maxX: x, minY: y, maxY: y, sx: 0, sy: 0 };
      bounds.set(label, b);
    }
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y;
    if (y > b.maxY) b.maxY = y;
    b.sx += x;
    b.sy += y;
  }

  for (let label = 1; label <= count; label++) {
    const area = sizes[label];
    if (area < options.minGlyphAreaPx || area > options.maxGlyphAreaPx) continue;
    const b = bounds.get(label);
    if (!b) continue;

    const cx = b.sx / area + x0;
    const cy = b.sy / area + y0;
    const d = Math.hypot(cx - stair.px, cy - stair.py);
    if (d < bestDistance) {
      bestDistance = d;
      bestLabel = label;
    }
  }

  if (bestLabel < 0) return undefined;
  const b = bounds.get(bestLabel);
  if (!b) return undefined;

  // Resample the glyph's bounding box onto a fixed grid so letters drawn at
  // slightly different sizes still compare.
  const size = options.size;
  const cells = new Float64Array(size * size);
  const gw = b.maxX - b.minX + 1;
  const gh = b.maxY - b.minY + 1;

  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      let hits = 0;
      let total = 0;
      const px0 = b.minX + Math.floor((gx * gw) / size);
      const px1 = b.minX + Math.max(px0 + 1, Math.floor(((gx + 1) * gw) / size));
      const py0 = b.minY + Math.floor((gy * gh) / size);
      const py1 = b.minY + Math.max(py0 + 1, Math.floor(((gy + 1) * gh) / size));

      for (let y = py0; y < py1 && y < h; y++) {
        for (let x = px0; x < px1 && x < w; x++) {
          total++;
          if (labels[y * w + x] === bestLabel) hits++;
        }
      }
      cells[gy * size + gx] = total > 0 ? hits / total : 0;
    }
  }

  return { cells, size, areaPx: sizes[bestLabel] };
}

/** Cosine similarity of two glyph signatures, in [0, 1]. */
export function glyphSimilarity(a: GlyphSignature, b: GlyphSignature): number {
  if (a.size !== b.size) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.cells.length; i++) {
    dot += a.cells[i] * b.cells[i];
    na += a.cells[i] * a.cells[i];
    nb += b.cells[i] * b.cells[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export interface StairPair {
  a: number;
  b: number;
  similarity: number;
}

/**
 * Links stairs whose labels look the same, across floors.
 *
 * A staircase is not necessarily a pair: a stairwell serving floors 1, 2 and 3
 * carries the same letter on all three and needs a link for each floor pair.
 * Stairs on the same panel never join - two similar labels on one floor are two
 * different staircases.
 */
export function pairStairsByGlyph(
  glyphs: (GlyphSignature | undefined)[],
  panelOf: number[],
  minSimilarity: number,
): StairPair[] {
  // Best match per (stair, other panel). Similarity is not an equivalence
  // relation - O resembles Q resembles D - so grouping by transitive closure
  // avalanches: on one map it merged every stair into a single group and chained
  // them all together, wiring shortcuts between unrelated stairwells. Requiring a
  // mutual best match keeps each link standing on its own evidence, while still
  // letting one stairwell link several floors, since each floor pair is judged
  // independently.
  const bestOnPanel = new Map<string, { index: number; similarity: number }>();

  for (let i = 0; i < glyphs.length; i++) {
    const gi = glyphs[i];
    if (!gi) continue;
    for (let j = 0; j < glyphs.length; j++) {
      if (i === j) continue;
      const gj = glyphs[j];
      if (!gj) continue;
      if (panelOf[i] === panelOf[j]) continue;

      const similarity = glyphSimilarity(gi, gj);
      if (similarity < minSimilarity) continue;

      const key = `${i}@${panelOf[j]}`;
      const current = bestOnPanel.get(key);
      if (!current || similarity > current.similarity) {
        bestOnPanel.set(key, { index: j, similarity });
      }
    }
  }

  const pairs: StairPair[] = [];
  const emitted = new Set<string>();

  for (const [key, best] of bestOnPanel) {
    const i = Number(key.slice(0, key.indexOf("@")));
    const j = best.index;

    const reverse = bestOnPanel.get(`${j}@${panelOf[i]}`);
    if (!reverse || reverse.index !== i) continue;

    const pairKey = i < j ? `${i}|${j}` : `${j}|${i}`;
    if (emitted.has(pairKey)) continue;
    emitted.add(pairKey);
    pairs.push({ a: Math.min(i, j), b: Math.max(i, j), similarity: best.similarity });
  }

  return pairs;
}

