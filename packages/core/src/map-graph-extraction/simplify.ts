/**
 * Reduces a raw traced skeleton to a graph shaped like the hand-drawn ones:
 * junctions merged, corridor polylines simplified, and chain nodes placed at a
 * regular spacing.
 *
 * Reference statistics from the 23-event corpus these steps target: mean degree
 * 2.05–2.23, 60–80% degree-2 nodes, 10–20% dead ends, median edge length
 * 4.5–13 m.
 */

import { hasLineOfSight } from "./line-of-sight";
import type { BitMask, TracedEdge, TracedGraph, TracedNode } from "./types";

interface Point {
  px: number;
  py: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.px - b.px, a.py - b.py);
}

/** Perpendicular distance from `p` to the segment `a`–`b`. */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.px - a.px;
  const dy = b.py - a.py;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(p, a);

  const t = Math.max(0, Math.min(1, ((p.px - a.px) * dx + (p.py - a.py) * dy) / lengthSquared));
  return Math.hypot(p.px - (a.px + t * dx), p.py - (a.py + t * dy));
}

/** Ramer–Douglas–Peucker simplification of an open polyline. */
export function simplifyPolyline(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();

  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }

  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];

  const left = simplifyPolyline(points.slice(0, index + 1), tolerance);
  const right = simplifyPolyline(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

/**
 * Merges nodes that are the same decision point into one.
 *
 * Two things drive this. Thinning fragments each crossing into a clump of
 * junction pixels a pixel or two apart, and adjacent doorways produce junctions
 * that are topologically distinct but physically the same place.
 *
 * The radius adapts to local clearance. A corridor's medial axis is the line
 * people actually walk, so detail there is real and the base radius applies. A
 * wide hall or a tribune has no such line — its medial axis is a branching star
 * that no hand-drawn graph reproduces — so there the radius grows with the
 * clearance and the star collapses to a handful of nodes. `clearanceFactor` of 0
 * restores the old fixed-radius behaviour.
 */
export function mergeNearbyNodes(
  graph: TracedGraph,
  radiusPx: number,
  clearanceFactor = 0,
  freeSpace?: BitMask,
  wallTolerancePx = 2,
): TracedGraph {
  const parent = graph.nodes.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  // Merge only junction-to-junction. Dead ends are real graph features and
  // controls carry an identity that must not be absorbed into a neighbour.
  const mergeable = graph.nodes.filter((n) => n.kind === "junction");
  const radiusFor = (n: TracedNode): number =>
    clearanceFactor > 0 && n.clearancePx !== undefined
      ? Math.max(radiusPx, clearanceFactor * n.clearancePx)
      : radiusPx;

  for (let i = 0; i < mergeable.length; i++) {
    for (let j = i + 1; j < mergeable.length; j++) {
      // The smaller of the two radii, so a node in a hall does not reach out and
      // swallow a genuine corridor junction just outside it.
      const limit = Math.min(radiusFor(mergeable[i]), radiusFor(mergeable[j]));
      if (distance(mergeable[i], mergeable[j]) > limit) continue;

      // Two junctions on opposite sides of a wall can be close enough to merge
      // on distance alone. Merging them moves every edge that ended at either
      // one onto a shared centroid, and those edges then cut through the wall
      // that separates them.
      if (freeSpace && !hasLineOfSight(freeSpace, mergeable[i], mergeable[j], wallTolerancePx)) {
        continue;
      }

      union(mergeable[i].id, mergeable[j].id);
    }
  }

  const groups = new Map<number, TracedNode[]>();
  for (const node of graph.nodes) {
    const root = find(node.id);
    const group = groups.get(root);
    if (group) group.push(node);
    else groups.set(root, [node]);
  }

  // Pairwise visibility is not enough. Merging pulls every member's edges onto a
  // shared centroid, and a member that could see its partner may still not see
  // the point they collapse to - a group straddling a pillar has its centroid
  // inside the pillar. Groups that fail that test are left unmerged.
  if (freeSpace) {
    for (const [root, group] of [...groups]) {
      if (group.length < 2) continue;
      const cx = group.reduce((sum, n) => sum + n.px, 0) / group.length;
      const cy = group.reduce((sum, n) => sum + n.py, 0) / group.length;
      const centroid = { px: cx, py: cy };

      if (group.every((n) => hasLineOfSight(freeSpace, n, centroid, wallTolerancePx))) continue;

      groups.delete(root);
      for (const node of group) groups.set(-node.id - 1, [node]);
    }
  }

  const nodes: TracedNode[] = [];
  const remap = new Map<number, number>();

  for (const group of groups.values()) {
    const id = nodes.length;
    // A control's position is authoritative; never move it to a centroid.
    const control = group.find((n) => n.kind === "control");
    const representative = control ?? group[0];
    nodes.push({
      id,
      px: control ? control.px : group.reduce((s, n) => s + n.px, 0) / group.length,
      py: control ? control.py : group.reduce((s, n) => s + n.py, 0) / group.length,
      kind: representative.kind,
      controlId: control?.controlId,
      clearancePx: Math.max(...group.map((n) => n.clearancePx ?? 0)) || undefined,
    });
    for (const node of group) remap.set(node.id, id);
  }

  const edges: TracedEdge[] = [];
  const seen = new Set<string>();

  for (const edge of graph.edges) {
    const a = remap.get(edge.a) as number;
    const b = remap.get(edge.b) as number;

    // A self-loop is real only if it encloses something: a ring corridor around
    // an atrium. One that stays within the merge radius is a thinning artefact.
    if (a === b) {
      const centre = nodes[a]; // ids are dense array positions, assigned just above
      const extent = edge.polyline.reduce((m, p) => Math.max(m, distance(p, centre)), 0);
      if (extent <= radiusPx) continue;
      edges.push({ a, b, polyline: edge.polyline });
      continue;
    }

    // Two corridors can legitimately run between the same pair of junctions —
    // the east and west sides of a ring, for instance. Those are precisely the
    // route alternatives this project exists to compare, so parallel edges are
    // distinguished by their geometry and only exact repeats are dropped.
    const midpoint =
      edge.polyline.length > 0
        ? edge.polyline[Math.floor(edge.polyline.length / 2)]
        : { px: (nodes[a].px + nodes[b].px) / 2, py: (nodes[a].py + nodes[b].py) / 2 };

    const ends = a < b ? `${a}|${b}` : `${b}|${a}`;
    const key = `${ends}|${Math.round(midpoint.px)}|${Math.round(midpoint.py)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ a, b, polyline: edge.polyline });
  }

  return { ...graph, nodes, edges };
}

/** Total length of an edge, following its polyline. */
function edgeLength(edge: TracedEdge, nodeById: Map<number, TracedNode>): number {
  const a = nodeById.get(edge.a);
  const b = nodeById.get(edge.b);
  if (!a || !b) return 0;

  const path: Point[] = [a, ...edge.polyline, b];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += distance(path[i], path[i + 1]);
  return total;
}

/**
 * Removes dead-end branches shorter than `minLengthPx`.
 *
 * Pruning happens here rather than on the pixel skeleton because "is this pixel
 * a junction?" is not a reliable question to ask of an 8-connected skeleton: at
 * a T-joint the pixels flanking the stem also have eight-neighbour degree 3, so
 * a pixel-space walk stops one or two pixels early and trims real corridors. By
 * this point junction clusters have been merged into single nodes, so a
 * dead-end edge's length is exactly the branch length.
 *
 * The threshold widens with clearance. Every convex corner of an open area
 * spawns a medial-axis branch pointing at it; in a tribune or a hall those
 * radiating stubs are artefacts of the boundary shape, not cul-de-sacs anyone
 * can walk into. In a corridor a dead end of the same length is a real one, and
 * the base threshold keeps it.
 *
 * Removing a branch can leave its former junction with degree 1, so the sweep
 * repeats until nothing changes.
 */
export function pruneShortDeadEnds(
  graph: TracedGraph,
  minLengthPx: number,
  clearanceFactor = 0,
): TracedGraph {
  if (minLengthPx <= 0) return graph;

  let edges = graph.edges.slice();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  let changed = true;
  while (changed) {
    changed = false;

    const degree = new Map<number, number>();
    for (const edge of edges) {
      degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
      degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    }

    const kept = edges.filter((edge) => {
      if (edge.a === edge.b) return true;

      const endpointIsLoose =
        (degree.get(edge.a) === 1 && nodeById.get(edge.a)?.kind !== "control") ||
        (degree.get(edge.b) === 1 && nodeById.get(edge.b)?.kind !== "control");
      if (!endpointIsLoose) return true;

      // A branch loose at BOTH ends is a whole small corridor, not a spur off a
      // junction; deleting it would drop a real piece of the graph.
      if (degree.get(edge.a) === 1 && degree.get(edge.b) === 1) return true;

      const openness = Math.max(
        nodeById.get(edge.a)?.clearancePx ?? 0,
        nodeById.get(edge.b)?.clearancePx ?? 0,
      );
      const threshold =
        clearanceFactor > 0 ? Math.max(minLengthPx, clearanceFactor * openness) : minLengthPx;

      return edgeLength(edge, nodeById) >= threshold;
    });

    if (kept.length !== edges.length) {
      edges = kept;
      changed = true;
    }
  }

  return dropOrphanNodes({ ...graph, edges });
}

/**
 * Applies RDP to every edge polyline, without letting it cut through a wall.
 *
 * Plain RDP replaces a bend with a chord, and on a corridor that turns tightly
 * that chord can leave free space entirely - the edge then represents a route
 * straight through a wall, which is wrong however small the geometric error
 * looks. When `freeSpace` is supplied, each simplified edge is checked for line
 * of sight and re-simplified at a finer tolerance until it stays inside, falling
 * back to the traced polyline if nothing works.
 */
export function simplifyEdges(
  graph: TracedGraph,
  tolerancePx: number,
  freeSpace?: BitMask,
  wallTolerancePx = 2,
): TracedGraph {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const clears = (points: Point[]): boolean => {
    if (!freeSpace) return true;
    for (let i = 0; i < points.length - 1; i++) {
      if (!hasLineOfSight(freeSpace, points[i], points[i + 1], wallTolerancePx)) return false;
    }
    return true;
  };

  const edges = graph.edges.map((edge) => {
    if (edge.polyline.length === 0) return edge;
    const a = nodeById.get(edge.a) as TracedNode;
    const b = nodeById.get(edge.b) as TracedNode;
    const full = [a, ...edge.polyline, b];

    let simplified = simplifyPolyline(full, tolerancePx);
    for (let tolerance = tolerancePx / 2; tolerance >= 0.5 && !clears(simplified); tolerance /= 2) {
      simplified = simplifyPolyline(full, tolerance);
    }
    if (!clears(simplified)) simplified = full;

    return { ...edge, polyline: simplified.slice(1, -1).map((p) => ({ px: p.px, py: p.py })) };
  });

  return { ...graph, edges };
}

/**
 * Turns polyline interior points into real graph nodes, subdividing any segment
 * longer than `spacingPx`.
 *
 * The hand-drawn graphs are 60–80% degree-2 nodes because controls have to sit
 * on the graph and route geometry has to follow corridor shape. A graph of
 * junctions only would not support either.
 *
 * Spacing widens with clearance for the same reason the merge radius does. In a
 * corridor an intermediate node every few metres tracks the shape people follow.
 * An edge crossing an open hall is a straight line through empty space, and
 * subdividing it just puts nodes where there is nothing to represent — which is
 * how collapsing a tribune's junctions can still leave it dense with nodes.
 */
export function materializeChainNodes(
  graph: TracedGraph,
  spacingPx: number,
  clearanceFactor = 0,
): TracedGraph {
  const nodes = graph.nodes.map((n) => ({ ...n }));
  const edges: TracedEdge[] = [];
  // Looked up by id rather than array position: this is an exported function and
  // callers are not obliged to hand over a graph whose ids are dense indices.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  let nextId = nodes.reduce((m, n) => Math.max(m, n.id), -1) + 1;
  function addNode(px: number, py: number): number {
    const id = nextId++;
    const node = { id, px, py, kind: "chain" as const };
    nodes.push(node);
    nodeById.set(id, node);
    return id;
  }

  for (const edge of graph.edges) {
    const a = nodeById.get(edge.a);
    const b = nodeById.get(edge.b);
    if (!a || !b) continue;
    const path: Point[] = [a, ...edge.polyline, b];

    const openness = Math.max(a.clearancePx ?? 0, b.clearancePx ?? 0);
    const effectiveSpacing =
      clearanceFactor > 0 ? Math.max(spacingPx, clearanceFactor * openness) : spacingPx;

    let previousId = edge.a;
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const segmentLength = distance(from, to);
      const pieces = Math.max(1, Math.ceil(segmentLength / effectiveSpacing));

      for (let k = 1; k <= pieces; k++) {
        const isLastPieceOfLastSegment = i === path.length - 2 && k === pieces;
        const targetId = isLastPieceOfLastSegment
          ? edge.b
          : addNode(from.px + ((to.px - from.px) * k) / pieces, from.py + ((to.py - from.py) * k) / pieces);
        edges.push({ a: previousId, b: targetId, polyline: [] });
        previousId = targetId;
      }
    }
  }

  return { ...graph, nodes, edges };
}

/** Removes nodes no edge references. */
export function dropOrphanNodes(graph: TracedGraph): TracedGraph {
  const used = new Set<number>();
  for (const edge of graph.edges) {
    used.add(edge.a);
    used.add(edge.b);
  }

  const nodes: TracedNode[] = [];
  const remap = new Map<number, number>();
  for (const node of graph.nodes) {
    if (!used.has(node.id)) continue;
    const id = nodes.length;
    remap.set(node.id, id);
    nodes.push({ ...node, id });
  }

  const edges = graph.edges.map((edge) => ({
    ...edge,
    a: remap.get(edge.a) as number,
    b: remap.get(edge.b) as number,
  }));

  return { ...graph, nodes, edges };
}
