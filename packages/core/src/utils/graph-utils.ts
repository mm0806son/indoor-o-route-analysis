import type { Node, Edge } from "../models";
import type { RaceCourseData } from "../models/event";

/**
 * Returns a stable composite key for an edge, using "from|to".
 * Edges are uniquely identified by their (from, to) node pair.
 */
export function edgeKey(edge: Edge): string;
export function edgeKey(from: string, to: string): string;
export function edgeKey(edgeOrFrom: Edge | string, to?: string): string {
  if (typeof edgeOrFrom === "string") {
    return `${edgeOrFrom}|${to}`;
  }
  return `${edgeOrFrom.from}|${edgeOrFrom.to}`;
}

/**
 * Find an edge between two nodes by their IDs.
 * For bidirectional edges, checks both directions unless the edge is one-way.
 */
export function findEdgeByNodes(edges: Edge[], from: string, to: string): Edge | undefined {
  return edges.find(
    (e) => (e.from === from && e.to === to) || (!e.oneWay && e.from === to && e.to === from),
  );
}

/**
 * Result of a rename-all-nodes operation.
 * Contains the updated graph elements and the mapping from old to new IDs.
 */
export interface RenameResult {
  vertices: Node[];
  edges: Edge[];
  customRoutes: RaceCourseData["customRoutes"];
  /** Mapping from old node ID → new ID */
  idMap: Map<string, string>;
}

/**
 * Rename all node (vertex) IDs in a race course graph.
 *
 * Vertices are renumbered starting from {@link startId} (default 1000).
 * Edge from/to references and custom-route leg paths are updated accordingly.
 * Control IDs are never changed because they represent semantic control codes (e.g. "31").
 *
 * @returns A {@link RenameResult} with the updated collections and the ID mapping.
 */
export function renameAllNodes(
  raceCourse: RaceCourseData,
  startId: number = 1000,
): RenameResult {
  const vertices = raceCourse.vertices ?? [];
  const edges = raceCourse.edges ?? [];
  const controls = raceCourse.controls ?? [];
  const customRoutes = raceCourse.customRoutes ?? [];

  // Build a set of control IDs so we never rename them
  const controlIds = new Set(controls.map((c) => c.id));

  const idMap = new Map<string, string>();

  // --- 1. Assign new IDs to vertices ---
  let nextId = startId;
  const newVertices: Node[] = vertices.map((v) => {
    const newId = String(nextId++);
    idMap.set(v.id, newId);
    return { ...v, id: newId };
  });

  // --- 2. Update edge from/to references ---
  const newEdges: Edge[] = edges.map((e) => {
    // Update from/to – only remap if it is a vertex, not a control
    const newFrom = !controlIds.has(e.from) && idMap.has(e.from) ? idMap.get(e.from)! : e.from;
    const newTo = !controlIds.has(e.to) && idMap.has(e.to) ? idMap.get(e.to)! : e.to;

    return { ...e, from: newFrom, to: newTo };
  });

  // --- 3. Update custom routes ---
  const newCustomRoutes = customRoutes.map((route) => ({
    ...route,
    legs: route.legs.map((leg) => ({
      ...leg,
      path: leg.path.map((pn) => ({
        ...pn,
        nodeId: !controlIds.has(pn.nodeId) && idMap.has(pn.nodeId) ? idMap.get(pn.nodeId)! : pn.nodeId,
      })),
    })),
  }));

  return { vertices: newVertices, edges: newEdges, customRoutes: newCustomRoutes, idMap };
}

/**
 * Find all edges that are part of dead-end paths in a graph.
 *
 * A dead-end path is a non-branching chain of edges that terminates at a
 * leaf node (degree 1). The chain extends from the leaf back to the
 * nearest branching node (degree ≥ 3), including the edge that connects
 * to the branching node. Propagation never continues past a branching
 * node — even if all its branches are dead-ends, the node itself
 * remains a decision point.
 *
 * The algorithm walks inward from each leaf node along degree-2 nodes,
 * marking every traversed edge as dead-end, and stops as soon as it
 * reaches a node with degree ≥ 3 or another leaf.
 *
 * This function is reusable across the graph editor (for highlighting)
 * and scoring models (for difficulty analysis).
 *
 * @param edges - All edges in the graph
 * @param nodeIds - IDs of all nodes and controls in the graph
 * @returns Set of edge keys (edgeKey format) that are part of dead-end paths
 */
export function findDeadEndEdgeIds(edges: Edge[], nodeIds: string[]): Set<string> {
  const nodeIdSet = new Set(nodeIds);

  // Build adjacency: for each node, collect connected edge keys
  const nodeEdgeKeys = new Map<string, string[]>();
  for (const id of nodeIdSet) {
    nodeEdgeKeys.set(id, []);
  }

  // Build an edge lookup keyed by edgeKey for quick access
  const edgeMap = new Map<string, Edge>();
  for (const edge of edges) {
    const key = edgeKey(edge);
    edgeMap.set(key, edge);
    if (nodeIdSet.has(edge.from)) {
      nodeEdgeKeys.get(edge.from)!.push(key);
    }
    if (nodeIdSet.has(edge.to)) {
      nodeEdgeKeys.get(edge.to)!.push(key);
    }
  }

  // Record the original degree of every node (before any pruning)
  const nodeDegree = new Map<string, number>();
  for (const [nodeId, keys] of nodeEdgeKeys) {
    nodeDegree.set(nodeId, keys.length);
  }

  const deadEndEdgeIds = new Set<string>();

  // From each leaf node (degree 1), walk inward along degree-2 nodes
  // and mark edges as dead-end until reaching a branching node (degree ≥ 3)
  for (const [startNodeId, degree] of nodeDegree) {
    if (degree !== 1) continue;

    let currentNodeId = startNodeId;

    while (true) {
      const currentEdgeKeys = nodeEdgeKeys.get(currentNodeId);
      if (!currentEdgeKeys) break;

      // Find an edge from this node that hasn't been marked yet
      let nextEdgeKey: string | null = null;
      for (const ek of currentEdgeKeys) {
        if (!deadEndEdgeIds.has(ek)) {
          nextEdgeKey = ek;
          break;
        }
      }
      if (!nextEdgeKey) break;

      // Mark this edge as dead-end
      deadEndEdgeIds.add(nextEdgeKey);

      // Find the neighbor on the other side
      const edge = edgeMap.get(nextEdgeKey)!;
      const neighborId = edge.from === currentNodeId ? edge.to : edge.from;
      const neighborDeg = nodeDegree.get(neighborId) ?? 0;

      // Stop at branching nodes (original degree ≥ 3) — they are decision
      // points and dead-end paths do not propagate through them
      if (neighborDeg >= 3) break;

      // Continue if neighbor is a pass-through node (degree 2)
      if (neighborDeg === 2) {
        currentNodeId = neighborId;
        continue;
      }

      // Degree 0 or 1 (another leaf or isolated node) — stop
      break;
    }
  }

  return deadEndEdgeIds;
}

/**
 * Count the number of one-way edges traversed in a path.
 * One-way edges add difficulty as runners must recognize the constraint.
 */
export function countOneWayEdgesInPath(path: string[], findEdge: (from: string, to: string) => Edge | undefined): number {
  let count = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const edge = findEdge(path[i], path[i + 1]);
    if (edge?.oneWay) {
      count++;
    }
  }

  return count;
}

/**
 * Count the number of ignoreLength edges (stairs) traversed in a path.
 * These represent level changes in indoor orienteering.
 */
export function countIgnoreLengthEdgesInPath(path: string[], findEdge: (from: string, to: string) => Edge | undefined): number {
  let count = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const edge = findEdge(path[i], path[i + 1]);
    if (edge?.ignoreLength) {
      count++;
    }
  }

  return count;
}

/**
 * Count alternative edges at junctions along a path.
 * Counts edges that branch off from the chosen route at each node.
 * Dead-end edges are excluded — they don't represent meaningful alternatives.
 */
export function countAlternativeEdgesInPath(
  path: string[],
  nodeEdges: Map<string, Edge[]>,
  deadEndEdgeIds: Set<string>,
): number {
  let totalAlternativeEdges = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const nodeId = path[i];
    const nextNodeId = path[i + 1];
    const incomingNodeId = i > 0 ? path[i - 1] : null;

    // Count non-dead-end alternative outgoing edges (excluding path edge and incoming)
    const alternatives = (nodeEdges.get(nodeId) || []).filter((e: Edge) => {
      if (e.from !== nodeId) return false;
      // Exclude the incoming direction
      if (incomingNodeId && e.to === incomingNodeId) return false;
      // Exclude the path edge (it's the route, not an alternative)
      if (e.to === nextNodeId) return false;
      // Exclude dead-end edges
      if (deadEndEdgeIds.has(edgeKey(e))) return false;
      return true;
    });

    totalAlternativeEdges += alternatives.length;
  }

  return totalAlternativeEdges;
}
