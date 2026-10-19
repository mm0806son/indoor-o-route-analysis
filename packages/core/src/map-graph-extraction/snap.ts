/**
 * Attaches a point to an existing traced graph by splitting the nearest edge.
 *
 * Used for both stair candidates and existing controls. Runs after chain nodes
 * have been materialised, so every edge is a straight segment.
 */

import type { TracedGraph, TracedNode } from "./types";

export interface SnapResult {
  graph: TracedGraph;
  /** Id of the node created (or reused) at the snapped position. */
  nodeId: number;
  /** Distance in pixels from the requested point to the graph. */
  distancePx: number;
}

/** A prospective attachment position, offered to `SnapOptions.accept`. */
export interface SnapCandidate {
  px: number;
  py: number;
  /** Set when the candidate is an existing node rather than an insertion point. */
  nodeId?: number;
}

export interface SnapOptions {
  /** Candidates further than this from the requested point are never offered. */
  maxDistancePx?: number;
  /**
   * Judges each candidate, nearest first; the first accepted wins.
   *
   * Without it the nearest candidate wins outright — which is a veto when that
   * single candidate happens to be unusable. A control whose room joins the
   * corridor around a corner has its nearest graph position behind that corner;
   * the panel is connected, so a slightly farther candidate is in plain sight.
   */
  accept?(candidate: SnapCandidate): boolean;
}

/**
 * Snaps `point` onto `graph`.
 *
 * If the nearest position on the graph is within `snapToExistingPx` of an
 * existing node, that node is reused and retyped rather than a new one being
 * inserted a few pixels away. When `options.accept` refuses the pulled node,
 * the raw projection on the same edge is offered before the next edge is tried:
 * reusing nearby nodes is de-duplication, and de-duplication must not veto an
 * otherwise valid attachment.
 *
 * Returns `undefined` when the graph has no edges to attach to, or when no
 * candidate within `options.maxDistancePx` was accepted.
 */
export function snapPointToGraph(
  graph: TracedGraph,
  point: { px: number; py: number },
  attributes: Pick<TracedNode, "kind" | "controlId">,
  snapToExistingPx: number,
  options?: SnapOptions,
): SnapResult | undefined {
  if (graph.edges.length === 0) return undefined;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const candidates: { edgeIndex: number; x: number; y: number; d: number }[] = [];

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const a = nodeById.get(edge.a);
    const b = nodeById.get(edge.b);
    if (!a || !b) continue;

    const dx = b.px - a.px;
    const dy = b.py - a.py;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.px - a.px) * dx + (point.py - a.py) * dy) / lengthSquared));

    const x = a.px + t * dx;
    const y = a.py + t * dy;
    const d = Math.hypot(point.px - x, point.py - y);

    if (options?.maxDistancePx !== undefined && d > options.maxDistancePx) continue;
    candidates.push({ edgeIndex: i, x, y, d });
  }

  // Stable sort: candidates at equal distance keep edge order, matching the
  // first-strictly-smaller behaviour this function had before it enumerated.
  candidates.sort((a, b) => a.d - b.d);

  for (const candidate of candidates) {
    const edge = graph.edges[candidate.edgeIndex];
    const a = nodeById.get(edge.a) as TracedNode;
    const b = nodeById.get(edge.b) as TracedNode;

    const distanceToA = Math.hypot(candidate.x - a.px, candidate.y - a.py);
    const distanceToB = Math.hypot(candidate.x - b.px, candidate.y - b.py);
    const target = distanceToA <= distanceToB ? a : b;

    // A node that already carries a control id is that control. Retyping it
    // would hand its identity to a second control, leaving the first with no
    // edges at all while still being reported as attached. Two controls within
    // the snap radius of each other is ordinary indoors, so this must insert
    // instead.
    const pulled =
      Math.min(distanceToA, distanceToB) <= snapToExistingPx &&
      !(target.controlId && target.controlId !== attributes.controlId);

    if (pulled && (!options?.accept || options.accept({ px: target.px, py: target.py, nodeId: target.id }))) {
      const nodes = graph.nodes.map((n) => ({ ...n }));
      const edges = graph.edges.map((e) => ({ ...e }));
      const existing = nodes.find((n) => n.id === target.id) as TracedNode;
      existing.kind = attributes.kind;
      if (attributes.controlId) existing.controlId = attributes.controlId;
      return { graph: { ...graph, nodes, edges }, nodeId: existing.id, distancePx: candidate.d };
    }

    if (pulled && options?.accept && candidate.x === target.px && candidate.y === target.py) {
      // The refused node is exactly the projection; re-offering the same
      // position as an insertion would just be refused again.
      continue;
    }

    if (!options?.accept || options.accept({ px: candidate.x, py: candidate.y })) {
      const nodes = graph.nodes.map((n) => ({ ...n }));
      const edges = graph.edges.map((e) => ({ ...e }));

      const id = nodes.reduce((m, n) => Math.max(m, n.id), -1) + 1;
      nodes.push({ id, px: candidate.x, py: candidate.y, kind: attributes.kind, controlId: attributes.controlId });

      edges.splice(candidate.edgeIndex, 1);
      edges.push({ a: edge.a, b: id, polyline: [] });
      edges.push({ a: id, b: edge.b, polyline: [] });

      return { graph: { ...graph, nodes, edges }, nodeId: id, distancePx: candidate.d };
    }
  }

  return undefined;
}
