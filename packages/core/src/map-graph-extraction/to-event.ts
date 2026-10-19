/**
 * The one module that crosses from pixel space into event space.
 *
 * Everything upstream is pure pixel processing; everything downstream is
 * ordinary event data. Keeping the crossing in a single place is what lets the
 * pixel pipeline be tested with hand-written bitmaps.
 */

import { getEventTransform } from "../models/event";
import { getDocumentDimensions } from "../models/map";
import { MM_TO_METERS } from "../rendering-constants";
import type { Edge, Node } from "../models/graph";
import type { MapData, MapPosition } from "../models/map";
import type { TracedGraph } from "./types";

/** Maps page-local pixels to event coordinates for one page of a map document. */
export interface PixelToEvent {
  toEvent(px: number, py: number): MapPosition;
  /** Inverse of {@link toEvent}, used to place existing controls in pixel space. */
  toPixel(position: MapPosition): { px: number; py: number };
  /**
   * Real-world metres per pixel.
   *
   * Derived from the event transform, never from DPI. Event coordinates are not
   * document millimetres: measured across the example corpus the ratio between
   * them runs from 0.50 to 1.96, so a DPI-based factor would be wrong by up to
   * 2× on maps already in the repository.
   */
  readonly metresPerPixel: number;
}

export function createPixelToEvent(
  mapData: MapData | undefined,
  pageIndex: number,
  imageWidthPx: number,
  imageSpans: "page" | "document" = "page",
): PixelToEvent {
  const transform = getEventTransform(mapData, pageIndex);

  // The millimetre span the raster covers. Getting this wrong scales every
  // metre-valued parameter: a document-wide raster measured against one page's
  // width is off by the page count.
  const spanMm = mapData
    ? imageSpans === "document"
      ? getDocumentDimensions(mapData).width
      : (mapData.image.width ?? imageWidthPx)
    : imageWidthPx;
  const pixelsPerMm = imageWidthPx / spanMm;
  const scale = mapData?.scale ?? 1;

  // In manual mode each page has its own transform, which already accounts for
  // where the page sits. In automatic mode there is one transform over the whole
  // composited document, so a page-local pixel has to be shifted into document
  // space first or every page after the first lands on top of page one.
  let offsetMmX = 0;
  let offsetMmY = 0;
  if (mapData && imageSpans === "page" && mapData.pageTransformMode !== "manual") {
    if (mapData.layout === "horizontal") offsetMmX = pageIndex * (mapData.image.width ?? 0);
    else if (mapData.layout === "vertical") offsetMmY = pageIndex * (mapData.image.height ?? 0);
  }

  const toEvent = (px: number, py: number): MapPosition =>
    transform.toEvent({ x: px / pixelsPerMm + offsetMmX, y: py / pixelsPerMm + offsetMmY });

  const toPixel = (position: MapPosition): { px: number; py: number } => {
    const mm = transform.toMap(position);
    return { px: (mm.x - offsetMmX) * pixelsPerMm, py: (mm.y - offsetMmY) * pixelsPerMm };
  };

  const origin = toEvent(0, 0);
  const oneAcross = toEvent(1, 0);
  const oneDown = toEvent(0, 1);
  const eventUnitsPerPixel =
    (Math.hypot(oneAcross.x - origin.x, oneAcross.y - origin.y) +
      Math.hypot(oneDown.x - origin.x, oneDown.y - origin.y)) /
    2;

  return { toEvent, toPixel, metresPerPixel: eventUnitsPerPixel * scale * MM_TO_METERS };
}

export interface IdAllocator {
  next(): string;
}

/**
 * Allocates graph node ids that cannot collide with anything already present.
 *
 * Vertex ids are not always numeric — Ale E1/E2 and Moss are entirely UUIDs and
 * Åre is 247 of 253 — so a plain "maximum + 1" has nothing to work from. Control
 * ids share the edge-endpoint namespace and reach 235 in the corpus. The floor
 * of 1000 matches what the existing graph editor already does, which also makes
 * the rule correct for a brand new event with no vertices at all.
 */
export function createIdAllocator(existingIds: Iterable<string>): IdAllocator {
  let maximum = 999;
  for (const id of existingIds) {
    if (!/^\d+$/.test(id)) continue;
    const value = Number.parseInt(id, 10);
    if (value > maximum) maximum = value;
  }

  let next = maximum + 1;
  return {
    next: () => String(next++),
  };
}

export interface ConvertedGraph {
  vertices: Node[];
  edges: Edge[];
  /** Traced node id → emitted node id, for callers that need to follow through. */
  idByTracedNode: Map<number, string>;
}

/**
 * Converts a traced graph to event-space vertices and edges.
 *
 * Nodes carrying a control id emit no vertex: the control already exists in the
 * event data and is referenced by the edges directly, matching the project's
 * convention that control ids double as graph node ids.
 */
export function tracedGraphToEvent(
  graph: TracedGraph,
  mapping: PixelToEvent,
  ids: IdAllocator,
): ConvertedGraph {
  const vertices: Node[] = [];
  const idByTracedNode = new Map<number, string>();

  for (const node of graph.nodes) {
    if (node.kind === "control" && node.controlId) {
      idByTracedNode.set(node.id, node.controlId);
      continue;
    }
    const position = mapping.toEvent(node.px, node.py);
    const id = ids.next();
    idByTracedNode.set(node.id, id);
    vertices.push({ id, x: position.x, y: position.y });
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (const edge of graph.edges) {
    const from = idByTracedNode.get(edge.a);
    const to = idByTracedNode.get(edge.b);
    if (!from || !to || from === to) continue;

    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (seen.has(key)) continue;
    seen.add(key);

    edges.push({ from, to, label: "", oneWay: false, ignoreLength: false });
  }

  return { vertices, edges, idByTracedNode };
}
