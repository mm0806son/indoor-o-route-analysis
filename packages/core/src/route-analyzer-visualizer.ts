import type { RouteInfo } from "./route-analyzer";

/** Which search this event originated from. */
export type RouteAnalyzerAlgorithm = "dijkstra" | "all-routes" | "human-route";

export interface NodeSettledEvent {
  algorithm: RouteAnalyzerAlgorithm;
  nodeId: string;
  distance: number;
}

export interface EdgeEvaluatedEvent {
  algorithm: RouteAnalyzerAlgorithm;
  fromNodeId: string;
  toNodeId: string;
  /** True if this evaluation improved (relaxed) the known distance to toNodeId. */
  relaxed: boolean;
  distance: number;
}

export interface RouteFoundEvent {
  algorithm: RouteAnalyzerAlgorithm;
  route: RouteInfo;
  /** 0-based order in which this route was discovered during this call. */
  rank: number;
}

/**
 * Optional visualization hooks into RouteAnalyzer's search algorithms.
 * All methods are optional and called via optional chaining, so attaching a
 * visualizer has no effect on the algorithms themselves — it is purely an
 * observation point for rendering/tracing tools.
 */
export interface RouteAnalyzerVisualizer {
  onNodeSettled?(event: NodeSettledEvent): void;
  onEdgeEvaluated?(event: EdgeEvaluatedEvent): void;
  onRouteFound?(event: RouteFoundEvent): void;
}
