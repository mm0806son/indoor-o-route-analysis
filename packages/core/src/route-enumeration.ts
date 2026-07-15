/**
 * Enumerates ALL distinct alternative routes between two graph nodes,
 * where "distinct" means a unique visible stair-label sequence — the
 * enumeration RouteAnalyzer's optimal analyzers rely on (as opposed to the
 * single-route search in route-search.ts, or the human-planning simulation
 * in human-route.ts). See docs/algorithms/route-analyzer-algorithms.md and
 * planning/04-route-analyzer-decomposition.md (step 4) for the algorithm's
 * background and extraction history.
 *
 * Extracted from RouteAnalyzer.findAllAlternativePathsBetweenControls so
 * the search is testable standalone, with an explicit input/output
 * contract instead of `this`.
 *
 * Approach (unchanged from the original):
 * 1. Union-Find condenses same-floor regions into clusters (shared with the
 *    human-route simulation via computeSameFloorClusters).
 * 2. A cluster graph is built where labeled (stair) edges and one-way
 *    unlabeled edges become directed cluster-to-cluster edges.
 * 3. A best-first (A*) search enumerates distinct label sequences on the
 *    cluster graph: each underlying labeled edge may be crossed at most
 *    once per route, and the true remaining shortest distance (computed
 *    once via a reverse-graph Dijkstra from the target) is an admissible
 *    heuristic.
 * 4. Each accepted sequence is stitched into a concrete node path via a
 *    memoized unlabeled-only Dijkstra between consecutive waypoints.
 */

import type { Control } from "./models/control";
import type { Edge, Node } from "./models/graph";
import type { RouteInfo } from "./route-analyzer";
import { BinaryHeap } from "./utils/binary-heap";
import { computeSameFloorClusters } from "./graph-clusters";
import { edgeKey } from "./utils/graph-utils";

/** Optional observation hooks into the search, for visualization/tracing. */
export interface RouteEnumerationHooks {
  onNodeSettled?(nodeId: string, distance: number): void;
  onEdgeEvaluated?(fromNodeId: string, toNodeId: string, relaxed: boolean, distance: number): void;
  /** Fired once per accepted route, in discovery order (rank 0-based), before the final distance sort. */
  onRouteFound?(route: RouteInfo, rank: number): void;
}

export interface RouteEnumerationContext {
  edges: Edge[];
  resolveNode(id: string): Node | Control | null;
  edgeDistanceMeters(edge: Edge | undefined, from: Node | Control | null, to: Node | Control | null): number;
  findEdge(fromId: string, toId: string): Edge | undefined;
  getRouteLabels(path: string[]): string[];
  /** Builds the final RouteInfo (with controls spliced in, difficulty scored, etc.) from a stitched node path. */
  buildRoute(path: string[]): RouteInfo;
  hooks?: RouteEnumerationHooks;
}

export interface RouteEnumerationResult {
  routes: RouteInfo[];
  /** True if more distinct label sequences remained in the search queue when `maxResults` was hit (caller may want to warn). */
  truncated: boolean;
}

/**
 * Find ALL alternative routes between two graph nodes that produce distinct
 * label sequences, sorted shortest first.
 *
 * @param maxResults - Maximum number of routes to return (default: 1000). If
 * more distinct sequences exist, only the `maxResults` shortest are returned
 * and the rest are dropped (`result.truncated` is set so the caller can warn).
 * @param distanceCutoff - Optional, default off: prune routes beyond
 * ratio*shortest or shortest+absoluteMeters.
 */
export function findAllAlternativePaths(
  fromNodeId: string,
  toNodeId: string,
  ctx: RouteEnumerationContext,
  maxResults: number = 1000,
  distanceCutoff?: { ratio?: number; absoluteMeters?: number },
): RouteEnumerationResult {
  const { edges, resolveNode, edgeDistanceMeters, findEdge, getRouteLabels, buildRoute, hooks } = ctx;

  // -------------------------------------------------------------------------
  // Phase 1: Union-Find with path compression
  // Merge nodes connected by unlabeled edges into clusters. One-way
  // unlabeled edges are NOT unioned — they become directed cluster edges
  // so that BFS within a cluster is always bidirectionally reachable.
  // -------------------------------------------------------------------------
  const uf = computeSameFloorClusters(edges);

  // -------------------------------------------------------------------------
  // Phase 2: Build cluster graph adjacency
  // Each labeled edge becomes a directed cluster edge (+ reverse if bidirectional).
  // One-way unlabeled edges also become directed cluster edges (with empty label).
  // Track the underlying edge ID to enforce "each physical edge used at most once".
  // -------------------------------------------------------------------------
  interface ClusterEdge {
    toCluster: string;
    label: string;
    fromNode: string;   // original graph node on the source side
    toNode: string;      // original graph node on the destination side
    edgeId: string;      // underlying edge key (same for both directions, used for deduplication)
  }
  const clusterAdj = new Map<string, ClusterEdge[]>();

  for (const edge of edges) {
    const hasLabel = edge.label && edge.label !== '';
    const isOneWayUnlabeled = !hasLabel && !!edge.oneWay;

    // Skip bidirectional unlabeled edges — they're within clusters
    if (!hasLabel && !isOneWayUnlabeled) continue;

    const fc = uf.find(edge.from);
    const tc = uf.find(edge.to);
    const label = edge.label || '';

    if (!clusterAdj.has(fc)) clusterAdj.set(fc, []);
    clusterAdj.get(fc)!.push({
      toCluster: tc, label, fromNode: edge.from, toNode: edge.to, edgeId: edgeKey(edge),
    });

    if (!edge.oneWay) {
      const revLabel = edge.reverseLabel || label;
      if (!clusterAdj.has(tc)) clusterAdj.set(tc, []);
      clusterAdj.get(tc)!.push({
        toCluster: fc, label: revLabel, fromNode: edge.to, toNode: edge.from, edgeId: edgeKey(edge),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Phase 4: Build unlabeled-only adjacency with edge weights for Dijkstra
  // -------------------------------------------------------------------------
  interface UnlabeledEdge { to: string; weight: number; }
  const unlabeledAdj = new Map<string, UnlabeledEdge[]>();

  for (const edge of edges) {
    if (edge.label && edge.label !== '') continue;

    // Compute distance weight for this edge
    const fromNode = resolveNode(edge.from);
    const toNode = resolveNode(edge.to);
    const weight = (fromNode && toNode)
      ? edgeDistanceMeters(edge, fromNode, toNode)
      : 1;

    if (!unlabeledAdj.has(edge.from)) unlabeledAdj.set(edge.from, []);
    unlabeledAdj.get(edge.from)!.push({ to: edge.to, weight });
    if (!edge.oneWay) {
      if (!unlabeledAdj.has(edge.to)) unlabeledAdj.set(edge.to, []);
      unlabeledAdj.get(edge.to)!.push({ to: edge.from, weight });
    }
  }

  // Dijkstra over unlabeled edges only, returning both path and distance.
  // Cached per (from,to). Uses a binary min-heap for O((V+E) log V).
  interface UnlabeledResult { path: string[]; distance: number; }
  const unlabeledCache = new Map<string, UnlabeledResult | null>();
  const findUnlabeled = (from: string, to: string): UnlabeledResult | null => {
    if (from === to) return { path: [from], distance: 0 };
    const cacheKey = `${from}:${to}`;
    const cached = unlabeledCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const dist = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    const heap = new BinaryHeap<[number, string]>((a, b) => a[0] - b[0]);
    heap.push([0, from]);

    while (heap.size > 0) {
      const [d, current] = heap.pop()!;
      if (visited.has(current)) continue;
      if (current === to) {
        const path: string[] = [];
        let n: string | undefined = to;
        while (n !== undefined) { path.unshift(n); n = prev.get(n); }
        const result = { path, distance: d };
        unlabeledCache.set(cacheKey, result);
        return result;
      }
      visited.add(current);
      hooks?.onNodeSettled?.(current, d);
      for (const { to: neighbor, weight } of (unlabeledAdj.get(current) || [])) {
        if (visited.has(neighbor)) continue;
        const newDist = d + weight;
        const relaxed = newDist < (dist.get(neighbor) ?? Infinity);
        if (relaxed) {
          dist.set(neighbor, newDist);
          prev.set(neighbor, current);
          heap.push([newDist, neighbor]);
        }
        hooks?.onEdgeEvaluated?.(current, neighbor, relaxed, newDist);
      }
    }
    unlabeledCache.set(cacheKey, null);
    return null;
  };

  // h(node) = true shortest distance from node to target over ALL edges
  // (labeled + unlabeled), used as an admissible A* heuristic. Computed once
  // by Dijkstra on the reversed graph from the target.
  const reverseAdj = new Map<string, Array<{ to: string; weight: number }>>();
  for (const edge of edges) {
    const fromNode = resolveNode(edge.from);
    const toNode = resolveNode(edge.to);
    const w = (fromNode && toNode)
      ? edgeDistanceMeters(edge, fromNode, toNode)
      : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(w)) continue;
    // forward edge from->to contributes a reverse edge to->from
    if (!reverseAdj.has(edge.to)) reverseAdj.set(edge.to, []);
    reverseAdj.get(edge.to)!.push({ to: edge.from, weight: w });
    if (!edge.oneWay) {
      if (!reverseAdj.has(edge.from)) reverseAdj.set(edge.from, []);
      reverseAdj.get(edge.from)!.push({ to: edge.to, weight: w });
    }
  }

  const h = new Map<string, number>([[toNodeId, 0]]);
  {
    const heap = new BinaryHeap<[number, string]>((a, b) => a[0] - b[0]);
    heap.push([0, toNodeId]);
    const visited = new Set<string>();
    while (heap.size > 0) {
      const entry = heap.pop();
      if (!entry) break;
      const [d, current] = entry;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const { to: neighbor, weight } of (reverseAdj.get(current) || [])) {
        const nd = d + weight;
        if (nd < (h.get(neighbor) ?? Infinity)) {
          h.set(neighbor, nd);
          heap.push([nd, neighbor]);
        }
      }
    }
  }
  const heuristic = (node: string): number => h.get(node) ?? Number.POSITIVE_INFINITY;

  // -------------------------------------------------------------------------
  // Phase 3+5: best-first enumeration of distinct label sequences.
  // State = position at a concrete node, with the set of physical labeled
  // edges already used and the waypoints crossed so far. Priority f = g + h
  // (g = exact stitched distance to `node`). A "completion" pop stitches the
  // remaining unlabeled path to the target and emits the route. Emit-time
  // dedup by visible label text keeps the first = shortest representative.
  // -------------------------------------------------------------------------
  const MAX_LABEL_DEPTH = 25;        // safety guard; stairs cost 0 m
  const MAX_POPS = 500_000;          // hard safety net
  const shortestH = heuristic(fromNodeId);
  const cutoffDistance = distanceCutoff
    ? Math.max(
        (distanceCutoff.ratio ?? Infinity) * shortestH,
        shortestH + (distanceCutoff.absoluteMeters ?? Infinity),
      )
    : Number.POSITIVE_INFINITY;

  interface SearchState {
    node: string;
    g: number;
    f: number;
    usedEdgeIds: Set<string>;
    waypoints: Array<{ from: string; to: string }>;
    completion: boolean;
  }

  // Min-heap of SearchState by f.
  const pq = new BinaryHeap<SearchState>((a, b) => a.f - b.f);

  const pushExpansions = (node: string, g: number, usedEdgeIds: Set<string>, waypoints: Array<{ from: string; to: string }>) => {
    // Completion: stitch straight to the target.
    const toTarget = findUnlabeled(node, toNodeId);
    if (toTarget) {
      const gc = g + toTarget.distance;
      if (gc <= cutoffDistance) {
        pq.push({ node: toNodeId, g: gc, f: gc, usedEdgeIds: new Set(usedEdgeIds), waypoints: [...waypoints], completion: true });
      }
    }
    if (waypoints.length >= MAX_LABEL_DEPTH) return;
    // Cross one more labeled (or one-way unlabeled) cluster edge.
    const cluster = uf.find(node);
    for (const e of (clusterAdj.get(cluster) || [])) {
      if (usedEdgeIds.has(e.edgeId)) continue;
      const toFrom = findUnlabeled(node, e.fromNode);
      if (!toFrom) continue;
      const edge = findEdge(e.fromNode, e.toNode);
      const fromN = resolveNode(e.fromNode);
      const toN = resolveNode(e.toNode);
      const crossLen = (edge && fromN && toN)
        ? edgeDistanceMeters(edge, fromN, toN)
        : 0;
      const g2 = g + toFrom.distance + (Number.isFinite(crossLen) ? crossLen : 0);
      const hNext = heuristic(e.toNode);
      if (!Number.isFinite(hNext)) continue;
      const f2 = g2 + hNext;
      if (g2 > cutoffDistance) continue;
      const nextUsed = new Set(usedEdgeIds);
      nextUsed.add(e.edgeId);
      const nextWp = [...waypoints, { from: e.fromNode, to: e.toNode }];
      hooks?.onEdgeEvaluated?.(e.fromNode, e.toNode, true, g2);
      pq.push({ node: e.toNode, g: g2, f: f2, usedEdgeIds: nextUsed, waypoints: nextWp, completion: false });
    }
  };

  const results: RouteInfo[] = [];
  const seenDescriptions = new Set<string>();
  pushExpansions(fromNodeId, 0, new Set(), []);

  let pops = 0;
  while (pq.size > 0 && results.length < maxResults && pops < MAX_POPS) {
    const state = pq.pop()!;
    pops++;
    if (!state.completion) {
      pushExpansions(state.node, state.g, state.usedEdgeIds, state.waypoints);
      continue;
    }

    // Stitch the concrete path for this completed sequence of waypoints.
    const fullPath: string[] = [];
    let valid = true;
    let cursor = fromNodeId;
    for (const wp of state.waypoints) {
      const seg = findUnlabeled(cursor, wp.from);
      if (!seg) { valid = false; break; }
      if (fullPath.length === 0) fullPath.push(...seg.path);
      else fullPath.push(...seg.path.slice(1));
      fullPath.push(wp.to); // cross the labeled edge
      cursor = wp.to;
    }
    if (!valid) continue;
    const endSeg = findUnlabeled(cursor, toNodeId);
    if (!endSeg) continue;
    if (fullPath.length === 0) fullPath.push(...endSeg.path);
    else fullPath.push(...endSeg.path.slice(1));

    // Dedup by visible stair-label sequence only (skips empty labels).
    // Routes crossing the same stairs via different one-way corridors share
    // the same visible label sequence and are NOT counted separately.
    const desc = getRouteLabels(fullPath).join(',');
    if (seenDescriptions.has(desc)) continue; // first pop = shortest representative
    seenDescriptions.add(desc);

    const routeInfo = buildRoute(fullPath);
    results.push(routeInfo);
    hooks?.onRouteFound?.(routeInfo, results.length - 1);
  }

  return {
    routes: results.sort((a, b) => a.distance - b.distance),
    truncated: results.length >= maxResults && pq.size > 0,
  };
}
