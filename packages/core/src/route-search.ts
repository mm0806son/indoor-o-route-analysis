/**
 * Pure Dijkstra shortest-path search over a pre-built weighted adjacency list.
 * Extracted from RouteAnalyzer so the search itself is testable without
 * instantiating a full analyzer (see planning/04-route-analyzer-decomposition.md).
 */

import type { Control } from "./models/control";
import type { Edge, Node } from "./models/graph";

/** Result from Dijkstra's shortest path algorithm. */
export interface PathResult {
  /** Total distance of the path in meters */
  distance: number;
  /** Ordered list of node IDs forming the shortest path */
  path: string[];
}

/** Adjacency list: nodeId -> Map<neighborId, edge weight>. */
export type WeightedGraph = Map<string, Map<string, number>>;

/**
 * Builds a weighted adjacency list from a set of edges. Bidirectional edges
 * produce entries in both directions; parallel edges are collapsed by
 * keeping the minimum weight per node pair.
 *
 * @param edges - Graph edges to include
 * @param resolveNode - Looks up a Node or Control by ID (nodes with no
 *   resolvable endpoint are skipped)
 * @param edgeDistance - Computes an edge's traversal weight for a given
 *   direction (already-oriented `from`/`to` positions), e.g. real-world
 *   meters with penalties applied
 */
export function buildAdjacencyList(
  edges: Edge[],
  resolveNode: (id: string) => Node | Control | null,
  edgeDistance: (edge: Edge, from: Node | Control, to: Node | Control) => number,
): WeightedGraph {
  const graph: WeightedGraph = new Map();

  for (const edge of edges) {
    const fromNode = resolveNode(edge.from);
    const toNode = resolveNode(edge.to);

    if (!fromNode || !toNode) continue;

    if (!graph.has(edge.from)) graph.set(edge.from, new Map());
    if (!graph.has(edge.to)) graph.set(edge.to, new Map());

    const distance = edgeDistance(edge, fromNode, toNode);
    if (Number.isFinite(distance)) {
      const forwardMap = graph.get(edge.from)!;
      const existing = forwardMap.get(edge.to);
      if (existing === undefined || distance < existing) {
        forwardMap.set(edge.to, distance);
      }
    }

    if (!edge.oneWay) {
      const reverseDistance = edgeDistance(edge, toNode, fromNode);
      if (Number.isFinite(reverseDistance)) {
        const reverseMap = graph.get(edge.to)!;
        const existing = reverseMap.get(edge.from);
        if (existing === undefined || reverseDistance < existing) {
          reverseMap.set(edge.from, reverseDistance);
        }
      }
    }
  }

  return graph;
}

/** Finds the unvisited node with minimum tentative distance. Helper for Dijkstra. */
function findMinDistanceNode(unvisited: Set<string>, distances: Map<string, number>): string | null {
  let minNode: string | null = null;
  let minDist = Infinity;

  for (const nodeId of unvisited) {
    const dist = distances.get(nodeId) ?? Infinity;
    if (dist < minDist) {
      minDist = dist;
      minNode = nodeId;
    }
  }

  return minNode;
}

/** Reconstructs a path from Dijkstra's `previous` pointer map. */
function reconstructPath(
  startNodeId: string,
  endNodeId: string,
  distances: Map<string, number>,
  previous: Map<string, string>,
): PathResult | null {
  const distance = distances.get(endNodeId) ?? Infinity;
  if (distance === Infinity) return null;

  const path: string[] = [];
  let current: string | undefined = endNodeId;
  while (current) {
    path.unshift(current);
    current = previous.get(current);
  }

  if (path[0] !== startNodeId) return null;

  return { distance, path };
}

/** Optional observation hooks into the search, for visualization/tracing. */
export interface DijkstraHooks {
  onNodeSettled?(nodeId: string, distance: number): void;
  onEdgeEvaluated?(fromNodeId: string, toNodeId: string, relaxed: boolean, distance: number): void;
}

/**
 * Finds the shortest path between two nodes in a weighted graph using
 * Dijkstra's algorithm.
 *
 * Time complexity: O((V + E) log V) with a priority queue; currently O(V²)
 * due to linear minimum-finding (acceptable for typical venue graph sizes —
 * see docs/algorithms/route-analyzer-algorithms.md).
 */
export function dijkstra(
  graph: WeightedGraph,
  startNodeId: string,
  endNodeId: string,
  hooks?: DijkstraHooks,
): PathResult | null {
  // Ensure start and end nodes exist in the graph, even if isolated.
  if (!graph.has(startNodeId)) graph.set(startNodeId, new Map());
  if (!graph.has(endNodeId)) graph.set(endNodeId, new Map());

  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set<string>();

  distances.set(startNodeId, 0);
  graph.forEach((_, nodeId) => {
    if (nodeId !== startNodeId) distances.set(nodeId, Infinity);
    unvisited.add(nodeId);
  });

  while (unvisited.size > 0) {
    const minNode = findMinDistanceNode(unvisited, distances);
    if (!minNode) break;

    const minDist = distances.get(minNode) ?? Infinity;
    if (minDist === Infinity) break;
    if (minNode === endNodeId) break;

    unvisited.delete(minNode);
    hooks?.onNodeSettled?.(minNode, minDist);

    const neighbors = graph.get(minNode);
    if (neighbors) {
      neighbors.forEach((edgeWeight, neighborId) => {
        if (!unvisited.has(neighborId)) return;

        const altDist = minDist + edgeWeight;
        const relaxed = altDist < (distances.get(neighborId) ?? Infinity);
        if (relaxed) {
          distances.set(neighborId, altDist);
          previous.set(neighborId, minNode);
        }
        hooks?.onEdgeEvaluated?.(minNode, neighborId, relaxed, altDist);
      });
    }
  }

  return reconstructPath(startNodeId, endNodeId, distances, previous);
}

/** Everything needed to run a shortest-path search directly over a raw edge list, skipping the adjacency-list-building step. */
export interface ShortestPathContext {
  edges: Edge[];
  resolveNode(id: string): Node | Control | null;
  /** Computes an edge's traversal weight for a given, already-oriented direction (e.g. real-world meters with penalties applied). */
  edgeDistanceMeters(edge: Edge | undefined, from: Node | Control | null, to: Node | Control | null): number;
  hooks?: DijkstraHooks;
}

/**
 * Builds the weighted adjacency list from `ctx` and runs Dijkstra in one
 * call — the composition every caller with a raw edge list needs, so they
 * don't have to build the graph by hand each time.
 */
export function findShortestPath(startNodeId: string, endNodeId: string, ctx: ShortestPathContext): PathResult | null {
  const graph = buildAdjacencyList(
    ctx.edges,
    ctx.resolveNode,
    (edge, from, to) => ctx.edgeDistanceMeters(edge, from, to),
  );
  return dijkstra(graph, startNodeId, endNodeId, ctx.hooks);
}
