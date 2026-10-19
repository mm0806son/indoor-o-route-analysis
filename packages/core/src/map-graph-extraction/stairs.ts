/**
 * Stair detection.
 *
 * Stairs carry dedicated area symbols in the indoor kartnorm — `401.1 Röd
 * trappfärg` and `401.2 Blå trappfärg` — so their positions come from colour
 * alone. Pairing them across floors is left to the user: the letter labels
 * (`603.1 Trappbokstav`) would need OCR, and a misread letter would silently
 * connect the wrong storeys.
 */

import { connectedComponents } from "./morphology";
import { maskForRoles } from "./palette";
import { snapPointToGraph } from "./snap";
import type { PaletteEntry, TracedGraph } from "./types";

export interface StairBlob {
  px: number;
  py: number;
  areaPx: number;
  variant: "red" | "blue";
  /**
   * Pixel bounding box of the blob's ink. The centroid alone cannot say what
   * the stair touches: a mezzanine stair's paint reaches the floor area it
   * climbs from and the one it lands on, and that adjacency is how a
   * within-page stair is told apart from one whose partner is on another floor.
   */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface DetectedStair extends StairBlob {
  /** Traced node id the stair was attached to. */
  nodeId: number;
}

export interface StairBlobOptions {
  minAreaPx: number;
  /**
   * Blobs above this are not stairs.
   *
   * `Bla Trappa` is used both for stair areas and for `102.10/102.11 Kvadraten`,
   * the frame drawn around each floor panel, so colour alone cannot separate
   * them. Their sizes differ by three orders of magnitude: measured stairs run
   * 1-20 m2, a panel frame is hundreds.
   */
  maxAreaPx: number;
  /** Blobs longer than this multiple of their width are frames or text, not stairs. */
  maxElongation: number;
  /** Blobs whose centroids are closer than this are the same physical stair. */
  mergeDistancePx: number;
}

export interface StairAttachOptions {
  /** A stair further than this from a panel graph is not attached to it. */
  maxAttachDistancePx: number;
  snapToExistingPx: number;
}

/**
 * Finds stair areas on a page.
 *
 * Computed once per page rather than once per panel: the stair mask covers the
 * whole page regardless of which panel is being processed.
 *
 * Note that a stair is its own pixel role and is therefore *not* part of the
 * free-space mask, so a stair blob never overlaps a panel mask. Ownership has to
 * be decided by proximity to a panel's graph, not by overlap.
 *
 * The variant comes from the palette entry that actually matched the blob's
 * pixels rather than from the rendered colour: the two stair inks are separate
 * kartnorm entries and the entry index is already carried per pixel.
 */
export function findStairBlobs(
  classMap: Uint8Array,
  entryMap: Int16Array,
  palette: readonly PaletteEntry[],
  width: number,
  height: number,
  options: StairBlobOptions,
): StairBlob[] {
  const stairMask = maskForRoles(classMap, width, height, ["stairs"]);
  const { labels, sizes, count } = connectedComponents(stairMask);

  const accumulators = new Map<
    number,
    {
      x: number; y: number; n: number;
      minX: number; maxX: number; minY: number; maxY: number;
      variants: Map<string, number>;
    }
  >();

  for (let p = 0; p < labels.length; p++) {
    const label = labels[p];
    if (!label) continue;

    const x = p % width;
    const y = (p - x) / width;
    let acc = accumulators.get(label);
    if (!acc) {
      acc = {
        x: 0, y: 0, n: 0,
        minX: x, maxX: x, minY: y, maxY: y,
        variants: new Map(),
      };
      accumulators.set(label, acc);
    }
    acc.x += x;
    acc.y += y;
    acc.n++;
    if (x < acc.minX) acc.minX = x;
    if (x > acc.maxX) acc.maxX = x;
    if (y < acc.minY) acc.minY = y;
    if (y > acc.maxY) acc.maxY = y;

    const variant = palette[entryMap[p]]?.stairVariant;
    if (variant) acc.variants.set(variant, (acc.variants.get(variant) ?? 0) + 1);
  }

  const blobs: StairBlob[] = [];
  for (let label = 1; label <= count; label++) {
    if (sizes[label] < options.minAreaPx || sizes[label] > options.maxAreaPx) continue;
    const acc = accumulators.get(label);
    if (!acc) continue;

    const w = acc.maxX - acc.minX + 1;
    const h = acc.maxY - acc.minY + 1;
    if (Math.max(w, h) / Math.max(1, Math.min(w, h)) > options.maxElongation) continue;

    const dominant = [...acc.variants.entries()].sort((a, b) => b[1] - a[1])[0];
    blobs.push({
      px: acc.x / acc.n,
      py: acc.y / acc.n,
      areaPx: sizes[label],
      variant: (dominant?.[0] as "red" | "blue") ?? "red",
      minX: acc.minX,
      maxX: acc.maxX,
      minY: acc.minY,
      maxY: acc.maxY,
    });
  }

  return mergeNearbyBlobs(blobs, options.mergeDistancePx);
}

/**
 * Merges blobs that are the same physical stair.
 *
 * A stair symbol is routinely broken into pieces by the letter label drawn over
 * it or by a step line crossing it, so one staircase arrives as two or three
 * components a metre or two apart. Left unmerged they become separate
 * candidates, and the user is asked to pair a stair with itself.
 */
function mergeNearbyBlobs(blobs: StairBlob[], mergeDistancePx: number): StairBlob[] {
  if (mergeDistancePx <= 0) return blobs;

  const parent = blobs.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      if (Math.hypot(blobs[i].px - blobs[j].px, blobs[i].py - blobs[j].py) > mergeDistancePx) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[b] = a;
    }
  }

  const groups = new Map<number, StairBlob[]>();
  for (let i = 0; i < blobs.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(blobs[i]);
    else groups.set(root, [blobs[i]]);
  }

  return [...groups.values()].map((group) => {
    const area = group.reduce((sum, b) => sum + b.areaPx, 0);
    // Area-weighted centre, so a large tread is not pulled off by a small offcut.
    return {
      px: group.reduce((sum, b) => sum + b.px * b.areaPx, 0) / area,
      py: group.reduce((sum, b) => sum + b.py * b.areaPx, 0) / area,
      areaPx: area,
      variant: group.sort((a, b) => b.areaPx - a.areaPx)[0].variant,
      minX: Math.min(...group.map((b) => b.minX)),
      maxX: Math.max(...group.map((b) => b.maxX)),
      minY: Math.min(...group.map((b) => b.minY)),
      maxY: Math.max(...group.map((b) => b.maxY)),
    };
  });
}

/**
 * Distance from `blob` to the nearest position on `graph`, or undefined if the
 * graph has no edges.
 *
 * Used to pick which panel a stair belongs to before attaching it. Floor panels
 * sit millimetres apart on paper — at 1:500 a 5 m attach radius is a centimetre
 * — so without choosing a single owner the same physical stair would attach to
 * several panels and be reported once per panel.
 */
export function distanceToGraph(
  graph: TracedGraph,
  point: Pick<StairBlob, "px" | "py">,
): number | undefined {
  return snapPointToGraph(graph, point, { kind: "stair" }, 0)?.distancePx;
}

/**
 * Whether `blob`'s ink comes within `reachPx` of a panel's free space.
 *
 * A stair area is its own pixel role, so it never overlaps a panel mask; what
 * a staircase physically joins is read from what its paint almost touches. A
 * mezzanine stair drawn inside one floor's plan abuts both the floor it climbs
 * from and the landing it serves, while a stair whose partner is on another
 * drawn floor has page margin — outside pixels, far beyond reach — in between.
 */
export function stairAbutsPanel(
  blob: Pick<StairBlob, "minX" | "maxX" | "minY" | "maxY">,
  panel: { width: number; height: number; data: Uint8Array },
  reachPx: number,
): boolean {
  const r = Math.max(0, Math.round(reachPx));
  const x0 = Math.max(0, blob.minX - r);
  const x1 = Math.min(panel.width - 1, blob.maxX + r);
  const y0 = Math.max(0, blob.minY - r);
  const y1 = Math.min(panel.height - 1, blob.maxY + r);

  for (let y = y0; y <= y1; y++) {
    const row = y * panel.width;
    for (let x = x0; x <= x1; x++) {
      if (panel.data[row + x]) return true;
    }
  }
  return false;
}

/** Attaches a stair to a panel graph, splitting the nearest edge. */
export function attachStair(
  graph: TracedGraph,
  blob: StairBlob,
  options: StairAttachOptions,
): { graph: TracedGraph; stair: DetectedStair } | undefined {
  const snapped = snapPointToGraph(graph, blob, { kind: "stair" }, options.snapToExistingPx);
  if (!snapped || snapped.distancePx > options.maxAttachDistancePx) return undefined;

  return { graph: snapped.graph, stair: { ...blob, nodeId: snapped.nodeId } };
}
