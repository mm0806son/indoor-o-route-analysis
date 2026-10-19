/**
 * Turns a classified pixel map into the free-space mask the skeleton is built
 * from, and splits that mask into floor panels.
 */

import { maskForRoles } from "./palette";
import {
  closing,
  connectedComponents,
  createMask,
  opening,
  removeSmallHoles,
  removeSmallObjects,
} from "./morphology";
import type { BitMask } from "./types";

export interface FreeSpaceOptions {
  /** Closing radius in pixels. Heals corridors cut by overprint lines. */
  closingRadiusPx: number;
  /**
   * Opening radius in pixels. Removes protrusions and serrations narrower than
   * twice this.
   *
   * A stepped seating area has a saw-toothed outline, and the medial axis grows
   * a branch toward every tooth — a column of dead ends along the terraces that
   * no hand-drawn graph contains. Smoothing the boundary removes the cause
   * rather than pruning the symptom downstream. Keep it below half the narrowest
   * real corridor or openings will sever them.
   */
  openingRadiusPx: number;
  /**
   * Whether the violet barrier ink blocks.
   *
   * On a course-free base map this should stay on: taped-off boundaries are
   * exactly what a competitor cannot cross. On a map that still carries its
   * courses the same ink also draws every control circle and leg line, and a
   * control circle then becomes a closed ring that cuts its own control off from
   * the corridor. Prefer supplying a course-free base map over turning this off.
   */
  barriersBlock: boolean;
  /** Unset regions up to this many pixels are filled (in-room furniture). */
  maxFillHoleAreaPx: number;
  /** Set components below this many pixels are dropped (legend swatches). */
  minComponentAreaPx: number;
  /**
   * X offsets of page boundaries in a horizontally composited image, or Y
   * offsets for a vertical one. A one-pixel blocked seam is painted along each
   * before morphology.
   */
  seams?: { axis: "x" | "y"; offsets: number[] };
}

/**
 * Builds the free-space mask.
 *
 * Furniture is merged into free space rather than treated as an obstacle. A
 * runner walks around a table, but the corridor centreline should not weave
 * between tables — including furniture keeps the medial axis running down the
 * middle of the room, which is what the hand-drawn graphs do.
 *
 * The course overprint is excluded. Measured consequence of including it: the
 * course's straight inter-control lines connected every floor panel into one
 * component, producing routes that walk from floor 2 to floor 6.
 */
export function buildFreeSpace(
  classMap: Uint8Array,
  width: number,
  height: number,
  options: FreeSpaceOptions,
): BitMask {
  let mask = maskForRoles(classMap, width, height, ["passable", "furniture"]);
  const barriers = maskForRoles(classMap, width, height, ["barrier"]);

  if (options.seams) paintSeams(mask, options.seams);

  mask = closing(mask, options.closingRadiusPx);
  if (options.openingRadiusPx > 0) mask = opening(mask, options.openingRadiusPx);

  // Barriers are re-applied after morphology, not merely omitted before it.
  // Closing exists to heal corridors that overprint lines cut, and it heals a
  // taped-off boundary just as readily - the tape is drawn at the width the
  // closing radius is tuned to bridge. Stamping it back afterwards keeps the
  // healing without letting a route cross something a competitor cannot.
  if (options.barriersBlock) {
    for (let i = 0; i < mask.data.length; i++) {
      if (barriers.data[i]) mask.data[i] = 0;
    }
  }

  if (options.seams) paintSeams(mask, options.seams);

  mask = removeSmallHoles(mask, options.maxFillHoleAreaPx);
  mask = removeSmallObjects(mask, options.minComponentAreaPx);
  return mask;
}

/**
 * Clears a one-pixel line along each page boundary.
 *
 * Composited multi-page maps place different floors side by side. Without a
 * seam, closing can join free space across the boundary, and a polyline
 * straddling it would be converted with two different page transforms — a
 * coordinate discontinuity in the middle of one edge.
 */
function paintSeams(mask: BitMask, seams: { axis: "x" | "y"; offsets: number[] }): void {
  const { width, height, data } = mask;
  for (const offset of seams.offsets) {
    if (seams.axis === "x") {
      const x = Math.round(offset);
      if (x <= 0 || x >= width) continue;
      for (let y = 0; y < height; y++) data[y * width + x] = 0;
    } else {
      const y = Math.round(offset);
      if (y <= 0 || y >= height) continue;
      const row = y * width;
      for (let x = 0; x < width; x++) data[row + x] = 0;
    }
  }
}

export interface PanelMask {
  index: number;
  mask: BitMask;
  areaPx: number;
}

/**
 * Splits free space into floor panels.
 *
 * A panel is a connected component of free space within one page. Panels are
 * neither pages nor levels: SIC 2023 E2 has 12 hand-drawn panel polygons across
 * 5 levels.
 */
export function splitIntoPanels(freeSpace: BitMask, minPanelAreaPx: number): PanelMask[] {
  const { labels, sizes, count } = connectedComponents(freeSpace);
  const panels: PanelMask[] = [];

  for (let label = 1; label <= count; label++) {
    if (sizes[label] < minPanelAreaPx) continue;

    const mask = createMask(freeSpace.width, freeSpace.height);
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === label) mask.data[i] = 1;
    }
    panels.push({ index: panels.length, mask, areaPx: sizes[label] });
  }

  panels.sort((a, b) => b.areaPx - a.areaPx);
  return panels.map((panel, index) => ({ ...panel, index }));
}
