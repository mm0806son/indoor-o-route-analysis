/**
 * Shared types for map graph extraction.
 *
 * Everything from `palette` through `simplify` operates purely in pixel space
 * and knows nothing about orienteering or map coordinates. Only `to-event`
 * crosses into event space. See
 * docs/superpowers/specs/2026-07-27-map-graph-extraction-design.md.
 */

import type { MapPosition } from "../models/map";

/**
 * A raster image in RGBA order. Structural rather than the DOM `ImageData`, so
 * the pixel pipeline runs unchanged in the browser, in Node and under Vitest.
 */
export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8ClampedArray;
}

/** One rendered page of a map document, tagged with its index in that document. */
export interface PageImage {
  index: number;
  image: RasterImage;
}

/** A width × height binary mask, one byte per pixel (0 or 1). */
export interface BitMask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Pixel roles the palette can assign. `unknown` is treated as blocked. */
export type PixelRole =
  | "passable"
  | "furniture"
  | "blocked"
  | "stairs"
  | "overprint"
  /**
   * Taped-off boundaries and forbidden areas a competitor may not cross.
   *
   * Separate from `blocked` because it survives the morphological pass. Closing
   * heals gaps narrower than twice its radius, and barrier tape is drawn at
   * exactly that width, so a barrier treated as ordinary blocked pixels gets
   * bridged over and the route runs straight through it.
   */
  | "barrier"
  | "outside"
  | "unknown";

/** Numeric role codes stored in a class map, parallel to {@link ROLE_NAMES}. */
export const ROLE_NAMES: readonly PixelRole[] = [
  "passable",
  "furniture",
  "blocked",
  "stairs",
  "overprint",
  "barrier",
  "outside",
  "unknown",
] as const;

export function roleCode(role: PixelRole): number {
  return ROLE_NAMES.indexOf(role);
}

/** One ink from the indoor kartnorm, with the role its consuming symbols imply. */
export interface PaletteEntry {
  /** Colour name as it appears in the kartnorm symbol set. */
  name: string;
  /** sRGB used for matching. Measured where available, else converted from CMYK. */
  rgb: readonly [number, number, number];
  role: PixelRole;
  /** Stair variant, set only for the two stair inks. */
  stairVariant?: "red" | "blue";
}

/**
 * A node in the traced skeleton graph.
 *
 * Identity is carried by `id` from tracing onward. It must never be recovered
 * by comparing coordinates: RDP simplification and resampling move endpoints,
 * so coordinate equality stops holding while the topology is unchanged.
 */
export interface TracedNode {
  id: number;
  px: number;
  py: number;
  kind: "junction" | "dead-end" | "chain" | "stair" | "control";
  /** Set when `kind` is "control": the control's id in the event data. */
  controlId?: string;
  /**
   * Distance in pixels from this node to the nearest non-free pixel.
   *
   * Large in a hall, small in a corridor. Used to scale how aggressively nodes
   * merge: the medial axis of a wide open area is a branching star that no
   * hand-drawn graph would reproduce, whereas in a corridor it is the line
   * people actually walk.
   */
  clearancePx?: number;
}

export interface TracedEdge {
  a: number;
  b: number;
  /** Interior points between the endpoints, in pixel space. May be empty. */
  polyline: { px: number; py: number }[];
}

/** The traced graph of one floor panel on one page. */
export interface TracedGraph {
  pageIndex: number;
  panelIndex: number;
  nodes: TracedNode[];
  edges: TracedEdge[];
}

export interface PanelCandidate {
  index: number;
  pageIndex: number;
  outline: MapPosition[];
  holes?: MapPosition[][];
  areaSqM: number;
  /** Assigned by the user on acceptance; a `Polygon` is only built once it is set. */
  level?: number;
}

export interface StairCandidate {
  id: string;
  panelIndex: number;
  position: MapPosition;
  variant: "red" | "blue";
  areaSqM: number;
  /** Index used to match this stair against its letter glyph. */
  serial?: number;
}

export type DiagnosticCode =
  | "panel-bridged"
  | "palette-mismatch"
  | "over-segmented"
  | "stair-unpaired"
  | "control-unattached"
  | "course-overprint-blocks"
  | "stair-paired"
  | "stair-pair-uncertain"
  | "stair-bridged"
  | "edge-crosses-wall";

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  code: DiagnosticCode;
  message: string;
  where?: { panelIndex?: number; pageIndex?: number; position?: MapPosition };
}

/**
 * Extraction parameters, in metres.
 *
 * Metres are converted to pixels via a factor derived from the event transform,
 * never from DPI: event coordinates are not document millimetres, and the ratio
 * between them ranges from 0.50 to 1.96 across the example corpus.
 */
export interface ExtractionParams {
  deltaEAccept: number;
  deltaEMarginAccept: number;
  deltaEMarginRatio: number;
  closingRadiusMeters: number;
  /** Smooths serrated boundaries; must stay below half the narrowest corridor. */
  openingRadiusMeters: number;
  maxFillHoleAreaSqM: number;
  minPanelAreaSqM: number;
  minBranchLengthMeters: number;
  junctionMergeRadiusMeters: number;
  /**
   * Merge radius as a multiple of local clearance, applied where that exceeds
   * `junctionMergeRadiusMeters`. 0 disables clearance-adaptive merging.
   */
  clearanceMergeFactor: number;
  simplifyToleranceMeters: number;
  targetNodeSpacingMeters: number;
  maxControlSnapMeters: number;
  minStairAreaSqM: number;
  maxStairAreaSqM: number;
  maxStairElongation: number;
  stairMergeDistanceMeters: number;
  /** Whether the violet barrier ink blocks. See `FreeSpaceOptions.barriersBlock`. */
  barriersBlock: boolean;
  /** Blocked pixels an edge may cross before it is reported as passing through a wall. */
  maxWallCrossingMeters: number;
  /** Label-shape similarity required to pair two stairs. */
  stairPairMinSimilarity: number;
  /**
   * A stair blob whose ink comes within this of a second panel's free space is
   * treated as a within-page transition — a mezzanine stair drawn in place —
   * and bridges the two panels directly, no letter label needed. Page margins
   * are far wider than this, so stairs to other drawn floors never qualify.
   */
  stairBridgeReachMeters: number;
}

export const DEFAULT_EXTRACTION_PARAMS: ExtractionParams = {
  deltaEAccept: 20,
  deltaEMarginAccept: 30,
  deltaEMarginRatio: 0.6,
  closingRadiusMeters: 0.3,
  openingRadiusMeters: 0.4,
  maxFillHoleAreaSqM: 4,
  minPanelAreaSqM: 15,
  minBranchLengthMeters: 3,
  junctionMergeRadiusMeters: 1.5,
  clearanceMergeFactor: 1.5,
  simplifyToleranceMeters: 0.5,
  targetNodeSpacingMeters: 6,
  maxControlSnapMeters: 10,
  minStairAreaSqM: 0.5,
  maxStairAreaSqM: 60,
  maxStairElongation: 6,
  stairMergeDistanceMeters: 3,
  barriersBlock: true,
  maxWallCrossingMeters: 0.6,
  stairPairMinSimilarity: 0.86,
  stairBridgeReachMeters: 2,
};
