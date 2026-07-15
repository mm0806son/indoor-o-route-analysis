/**
 * Pure edge-label extraction for a path, extracted from RouteAnalyzer (see
 * planning/04-route-analyzer-decomposition.md step 5).
 */

import type { Edge } from "./models/graph";

/** The visible label sequence for a path — one entry per traversed edge that has a (non-empty) label. */
export function getRouteLabels(path: string[], findEdge: (fromId: string, toId: string) => Edge | undefined): string[] {
  const labels: string[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const fromNodeId = path[i];
    const toNodeId = path[i + 1];
    const edge = findEdge(fromNodeId, toNodeId);

    if (edge) {
      // Use reverse label if traversing edge in reverse direction
      const isReverse = edge.from === toNodeId && edge.to === fromNodeId;
      const label = isReverse && edge.reverseLabel ? edge.reverseLabel : edge.label;

      if (label) {
        labels.push(label);
      }
    }
  }

  return labels;
}

/** Human-readable, comma-space-separated description of a route from its edge labels. */
export function getRouteDescription(path: string[], findEdge: (fromId: string, toId: string) => Edge | undefined): string {
  return getRouteLabels(path, findEdge).join(", ");
}

/**
 * Comma-separated (no space) label sequence for a path — used to identify
 * routes with unique stair choices. Despite the name, this isn't filtered
 * to stair/ignoreLength edges specifically; it's the same label sequence
 * as getRouteLabels, just joined without a space.
 */
export function getStairSequence(path: string[], findEdge: (fromId: string, toId: string) => Edge | undefined): string {
  return getRouteLabels(path, findEdge).join(",");
}
