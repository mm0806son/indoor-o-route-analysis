/**
 * Decision-point/branching-point/alternative-edge analysis for a route,
 * extracted from RouteAnalyzer (see planning/04-route-analyzer-decomposition.md
 * step 5 — the last non-difficulty-aggregation method on the class).
 */

import type { Edge } from "./models/graph";
import { analyzeBranchingPoints, analyzeDecisionPoints, type RouteContext } from "./scoring-models";
import { edgeKey } from "./utils/graph-utils";

export interface AnalyzeRouteContext extends RouteContext {
  findEdge(fromId: string, toId: string): Edge | undefined;
  nodeEdges: Map<string, Edge[]>;
  deadEndEdgeIds: Set<string>;
}

export interface RouteAnalysisResult {
  decisionPoints: number;
  decisionPointNodeIds: string[];
  branchingPointNodeIds: string[];
  alternativeEdges: number;
}

/**
 * Analyze a route for decision points, branching points, and alternative edges.
 *
 * Decision points use {@link analyzeDecisionPoints}: nodes where the runner
 * faces a meaningful choice (dead-ends < 50 m and insignificant branches are
 * excluded). Branching points use {@link analyzeBranchingPoints}: every node
 * where the runner has more than one outgoing edge (no filtering). Both are
 * also used by the Alpha difficulty model via the same shared functions.
 */
export function analyzeRoute(ctx: AnalyzeRouteContext): RouteAnalysisResult {
  const path = ctx.path;

  // Decision points (filtered: excludes dead-ends and short branches)
  const dpAnalysis = analyzeDecisionPoints(ctx);

  // Branching points (all nodes with outgoing edges > 1, used by Alpha model)
  const bpAnalysis = analyzeBranchingPoints(ctx);

  // Alternative edges — count non-route, non-dead-end edges at each node
  let alternativeEdges = 0;

  const pathEdgeIds = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const edge = ctx.findEdge(path[i], path[i + 1]);
    if (edge) pathEdgeIds.add(edgeKey(edge));
  }

  for (let i = 0; i < path.length; i++) {
    const nodeId = path[i];
    const connectedEdges = ctx.nodeEdges.get(nodeId) || [];

    const routeEdgesAtNode = new Set<string>();

    if (i > 0) {
      const prevNodeId = path[i - 1];
      const hasEdgeFromPrev = connectedEdges.some(
        (e) => (e.from === prevNodeId && e.to === nodeId) || (!e.oneWay && e.from === nodeId && e.to === prevNodeId),
      );
      if (hasEdgeFromPrev) {
        routeEdgesAtNode.add(`${prevNodeId}-${nodeId}`);
      }
    }

    if (i < path.length - 1) {
      const nextNodeId = path[i + 1];
      const hasEdgeToNext = connectedEdges.some(
        (e) => (e.from === nodeId && e.to === nextNodeId) || (!e.oneWay && e.from === nextNodeId && e.to === nodeId),
      );
      if (hasEdgeToNext) {
        routeEdgesAtNode.add(`${nodeId}-${nextNodeId}`);
      }
    }

    let totalEdgesAtNode = 0;
    const countedEdges = new Set<string>();

    for (const edge of connectedEdges) {
      if (ctx.deadEndEdgeIds.has(edgeKey(edge)) && !pathEdgeIds.has(edgeKey(edge))) continue;
      const dirEdgeKey = edge.oneWay || edge.from === nodeId ? `${edge.from}-${edge.to}` : `${edge.to}-${edge.from}`;
      if (!countedEdges.has(dirEdgeKey)) {
        totalEdgesAtNode++;
        countedEdges.add(dirEdgeKey);
      }
    }

    alternativeEdges += totalEdgesAtNode - routeEdgesAtNode.size;
  }

  return {
    decisionPoints: dpAnalysis.count,
    decisionPointNodeIds: dpAnalysis.nodeIds,
    branchingPointNodeIds: bpAnalysis.nodeIds,
    alternativeEdges,
  };
}
