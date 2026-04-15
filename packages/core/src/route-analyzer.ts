import type { Control } from "./models/control";
import type { Node } from "./models/graph";
import type { Edge } from "./models/graph";
import { ScoringModel, ScoringModelRegistry, type DifficultyCategory, analyzeDecisionPoints } from "./scoring-models";

import { Polygon } from "./models/polygon";
import { findPolygonForPoint } from "./polygon-utils";
import { findDeadEndEdgeIds, edgeKey } from "./utils/graph-utils";

// ============================================================================
// Constants
// ============================================================================

/** Conversion factor from millimeters to meters */
const MM_TO_METERS = 0.001;

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Complete information about a route between two controls.
 * Includes distance, path, difficulty metrics, and level validation.
 */
export interface RouteInfo {
  /** Total distance in meters */
  distance: number;
  /** Ordered list of node/control IDs forming the path */
  path: string[];
  /** Polygon for each node/control in the path (indices match path array) */
  pathPolygons: (Polygon | undefined)[];
  /** Number of junctions where route choice is required */
  decisionPoints: number;
  /** Node IDs that are decision points along the route */
  decisionPointNodeIds: string[];
  /** Number of edges not taken at decision points */
  alternativeEdges: number;
  /** Number of one-way edges traversed */
  oneWayEdges: number;
  /** Number of ignoreLength edges traversed (stairs) */
  ignoreLengthEdges: number;
  /** Human-readable description built from edge labels */
  description: string;
  /** Array of edge labels encountered on the route */
  labels: string[];
  /** Calculated difficulty score */
  difficulty: number;
  /** Total climb in meters */
  totalClimb?: number;
  /** Ratio of route length that repeats edges from shortest routes of previous legs (0-1) */
  repetitionRatio?: number;
}

/**
 * Breakdown of difficulty factors for a leg.
 */
export interface LegDifficulty {
  /** Difficulty contribution from one-way edges */
  oneWay: number;
  /** Difficulty contribution from alternative route choices */
  alternativeEdges: number;
  /** Difficulty contribution from stairs (ignoreLength edges) */
  stairs: number;
  /** Sum of all difficulty factors */
  total: number;
}

/**
 * Result from Dijkstra's shortest path algorithm.
 */
interface PathResult {
  /** Total distance of the path in meters */
  distance: number;
  /** Ordered list of node IDs forming the shortest path */
  path: string[];
}

// Re-export for backward compatibility
export type { DifficultyCategory };

// ============================================================================
// Standalone Utility Functions
// ============================================================================

/**
 * Get the difficulty category (color/label) for a given difficulty score.
 * Uses the specified scoring model or falls back to the default model.
 *
 * @param difficulty - The numeric difficulty score
 * @param scoringModel - Optional scoring model to use for categorization
 * @returns The difficulty category with name, label, and colors
 */
export function getDifficultyCategory(difficulty: number, scoringModel?: ScoringModel): DifficultyCategory {
  const model = scoringModel ?? ScoringModelRegistry.getDefaultModel();
  return model.getDifficultyCategory(difficulty);
}

/**
 * Calculate the overall course difficulty from individual leg difficulties.
 * Uses the specified scoring model or falls back to the default model.
 *
 * @param legs - Array of objects containing difficulty scores for each leg
 * @param scoringModel - Optional scoring model to use for calculation
 * @returns The overall course difficulty score
 */
export function getCourseDifficulty(legs: Array<{ difficulty: number }>, scoringModel?: ScoringModel): number {
  const model = scoringModel ?? ScoringModelRegistry.getDefaultModel();
  return model.getCourseDifficulty(legs);
}

/**
 * Calculate the average course difficulty from individual leg difficulties.
 * Uses the specified scoring model or falls back to the default model.
 *
 * @param legs - Array of objects containing difficulty scores for each leg
 * @param scoringModel - Optional scoring model to use for calculation
 * @returns The average course difficulty score
 */
export function getCourseAverageDifficulty(legs: Array<{ difficulty: number }>, scoringModel?: ScoringModel): number {
  const model = scoringModel ?? ScoringModelRegistry.getDefaultModel();
  return model.getCourseAverageDifficulty(legs);
}

// ============================================================================
// RouteAnalyzer Class
// ============================================================================

/**
 * RouteAnalyzer provides graph-based route analysis for indoor orienteering.
 *
 * Key capabilities:
 * - Find shortest paths between controls using Dijkstra's algorithm
 * - Find alternative routes with unique stair sequences
 * - Calculate distances and difficulty scores
 * - Validate level changes through stair edges
 *
 * The analyzer builds an internal graph representation from nodes and edges,
 * mapping controls to their nearest graph nodes for pathfinding.
 *
 * @example
 * ```typescript
 * const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
 * const routes = analyzer.findAlternativePathsBetweenControls(fromId, toId, 6);
 * ```
 */
export class RouteAnalyzer {
  // ---------------------------------------------------------------------------
  // Private Fields
  // ---------------------------------------------------------------------------

  private readonly edges: Edge[];
  private readonly nodes: Node[];
  private readonly controls: Control[];
  private readonly mapScale: number;
  private readonly scoringModel: ScoringModel;
  private readonly polygons: Polygon[];

  /**
   * Maps control IDs to their nearest node IDs.
   * Used to connect controls to the graph for pathfinding.
   */
  private readonly controlNodeMap: Map<string, string>;

  /**
   * Fast lookup map for edges by node pair.
   * Key format: "fromNodeId:toNodeId" (both directions stored for bidirectional edges)
   */
  private readonly edgeLookup: Map<string, Edge>;

  /**
   * Maps node/control IDs to their coordinate objects.
   * Provides O(1) lookup instead of array searches.
   */
  private readonly nodeControlMap: Map<string, Node | Control>;

  /**
   * Maps node IDs to all edges connected to that node.
   * Provides O(1) lookup for finding all edges at a node.
   */
  private readonly nodeEdges: Map<string, Edge[]>;

  /**
   * Lazily computed set of dead-end edge IDs.
   * Dead-end paths don't contribute to difficulty scoring.
   */
  private _deadEndEdgeIds: Set<string> | null = null;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Create a new RouteAnalyzer instance.
   *
   * @param controls - Array of control points on the course
   * @param nodes - Array of graph nodes representing intersections/waypoints
   * @param edges - Array of edges connecting nodes
   * @param mapScale - Map scale factor (e.g., 5000 for 1:5000 scale)
   * @param scoringModel - Optional custom scoring model for difficulty calculation
   * @param polygons - Optional array of polygons for elevation lookup
   */
  constructor(
    controls: Control[],
    nodes: Node[],
    edges: Edge[],
    mapScale: number,
    scoringModel?: ScoringModel,
    polygons: Polygon[] = []
  ) {
    // Create local copies and merge controls into nodes
    this.controls = [...controls];
    this.polygons = polygons || [];

    // Initialize nodes map with provided nodes (copied)
    const nodeMap = new Map<string, Node>();
    nodes.forEach((node) => {
      nodeMap.set(node.id, { ...node });
    });

    // Add controls as nodes if they don't already exist
    controls.forEach((control) => {
      if (!nodeMap.has(control.id)) {
        nodeMap.set(control.id, {
          id: control.id,
          x: control.mapPosition?.x ?? 0,
          y: control.mapPosition?.y ?? 0,
        });
      }
    });

    this.nodes = Array.from(nodeMap.values());
    this.edges = edges.map((edge) => ({ ...edge }));

    this.mapScale = mapScale > 0 ? mapScale : 1;
    this.scoringModel = scoringModel ?? ScoringModelRegistry.getDefaultModel();

    // Build lookup maps for fast access
    this.nodeControlMap = this.buildNodeControlMap();
    this.edgeLookup = this.buildEdgeLookup();
    this.controlNodeMap = this.buildControlNodeMap();
    this.nodeEdges = this.buildNodeEdgesMap();
  }

  // ---------------------------------------------------------------------------
  // Initialization Methods (Private)
  // ---------------------------------------------------------------------------

  /**
   * Build a lookup map for nodes and controls by their ID.
   * Enables O(1) coordinate lookup instead of O(n) array search.
   */
  private buildNodeControlMap(): Map<string, Node | Control> {
    const map = new Map<string, Node | Control>();

    for (const node of this.nodes) {
      map.set(node.id, node);
    }
    for (const control of this.controls) {
      map.set(control.id, control);
    }

    return map;
  }

  /** Extract x/y coordinates from a Node (has x/y directly) or Control (has mapPosition). */
  private getXY(nodeOrControl: Node | Control): { x: number; y: number } {
    if ('x' in nodeOrControl) return { x: nodeOrControl.x, y: nodeOrControl.y };
    return { x: nodeOrControl.mapPosition.x, y: nodeOrControl.mapPosition.y };
  }

  /**
   * Build a lookup map for edges by node pair.
   * Stores both directions for bidirectional edges to enable O(1) edge lookup.
   *
   * Key format: "from:to"
   */
  private buildEdgeLookup(): Map<string, Edge> {
    const map = new Map<string, Edge>();

    for (const edge of this.edges) {
      // Store forward direction
      map.set(`${edge.from}:${edge.to}`, edge);

      // Store reverse direction for bidirectional edges
      if (!edge.oneWay) {
        map.set(`${edge.to}:${edge.from}`, edge);
      }
    }

    return map;
  }

  /**
   * Build mapping from each control to its nearest graph node.
   * Since controls are now included in the graph as nodes, this simply
   * maps each control to itself.
   */
  private buildControlNodeMap(): Map<string, string> {
    const map = new Map<string, string>();

    for (const control of this.controls) {
      map.set(control.id, control.id);
    }

    return map;
  }

  /**
   * Build a lookup map from node/control IDs to all edges connected to that node.
   * Stores both endpoints of each edge.
   */
  private buildNodeEdgesMap(): Map<string, Edge[]> {
    const map = new Map<string, Edge[]>();
    for (const edge of this.edges) {
      if (!map.has(edge.from)) map.set(edge.from, []);
      map.get(edge.from)!.push(edge);
      if (!map.has(edge.to)) map.set(edge.to, []);
      map.get(edge.to)!.push(edge);
    }
    return map;
  }

  /**
   * Get the set of dead-end edge IDs (lazily computed).
   * Dead-end edges are on non-branching chains ending at leaf nodes.
   */
  private getDeadEndEdgeIds(): Set<string> {
    if (this._deadEndEdgeIds === null) {
      const nodeIds = this.nodes.map((n) => n.id);
      this._deadEndEdgeIds = findDeadEndEdgeIds(this.edges, nodeIds);
    }
    return this._deadEndEdgeIds;
  }

  // ---------------------------------------------------------------------------
  // Node/Edge Lookup Methods (Private)
  // ---------------------------------------------------------------------------

  /**
   * Find a node or control by its ID.
   * Uses the pre-built lookup map for O(1) access.
   *
   * @param id - The node or control ID to find
   * @returns The node/control object, or null if not found
   */
  private findNodeOrControl(id: string): Node | Control | null {
    return this.nodeControlMap.get(id) ?? null;
  }

  /**
   * Find an edge between two nodes.
   * Uses the pre-built lookup map for O(1) access.
   * Handles both directions for bidirectional edges.
   *
   * @param fromId - Source node ID
   * @param toId - Target node ID
   * @returns The edge object, or undefined if no edge exists
   */
  private findEdge(fromId: string, toId: string): Edge | undefined {
    return this.edgeLookup.get(`${fromId}:${toId}`);
  }

  // ---------------------------------------------------------------------------
  // Distance Calculation Methods
  // ---------------------------------------------------------------------------

  /**
   * Calculate the distance of an edge in meters.
   *
   * For ignoreLength edges (stairs), returns zero distance.
   * For regular edges, calculates geometric distance using map scale.
   *
   * @param edge - The edge to measure (optional, for length adjustment)
   * @param fromNode - Source node coordinates
   * @param toNode - Target node coordinates
   * @param penalties - Optional multiplicative penalties for edges (key: "from:to")
   * @returns Distance in meters, or Infinity if nodes are invalid
   */
  private getCoordinates(item: Node | Control): { x: number; y: number } {
    if ("mapPosition" in item && item.mapPosition) {
      return item.mapPosition;
    }

    // TODO: throw error
    // Fallback for Node types or Controls without mapPosition (should not happen for Control)
    const node = item as any;
    return { x: node.x || 0, y: node.y || 0 };
  }

  private calculateEdgeDistanceMeters(
    edge: Edge | undefined,
    fromNode: Node | Control | null,
    toNode: Node | Control | null,
    penalties?: Map<string, number>,
  ): number {
    if (!fromNode || !toNode) {
      return Number.POSITIVE_INFINITY;
    }

    let distanceMeters = 0;

    // ignoreLength edges have no geometric distance contribution (e.g., teleport/stairs handled elsewhere)
    if (!edge?.ignoreLength) {
      const fromPos = this.getCoordinates(fromNode);
      const toPos = this.getCoordinates(toNode);
      const mapDistanceMM = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
      distanceMeters = mapDistanceMM * this.mapScale * MM_TO_METERS;
    }

    // Apply penalty if exists
    if (penalties && edge) {
      const penalty = penalties.get(`${edge.from}:${edge.to}`);
      if (penalty) {
        distanceMeters *= penalty;
      }
    }

    return distanceMeters;
  }

  /**
   * Calculate the total distance of a path in meters.
   *
   * @param path - Array of node/control IDs forming the path
   * @returns Total distance in meters
   */
  calculatePathDistance(path: string[]): number {
    let total = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const fromNode = this.findNodeOrControl(path[i]);
      const toNode = this.findNodeOrControl(path[i + 1]);
      const edge = this.findEdge(path[i], path[i + 1]);

      total += this.calculateEdgeDistanceMeters(edge, fromNode, toNode);
    }

    return total;
  }

  /**
   * Calculate the total distance of a route through the graph by finding the shortest path
   * between consecutive waypoint nodes. This is different from calculatePathDistance which
   * assumes direct edges exist between consecutive nodes.
   *
   * @param waypoints - Array of waypoint node/control IDs (e.g., [start, nodeA, nodeB, end])
   * @returns Total distance in meters along the shortest paths through the graph
   */
  calculatePathDistanceThroughGraph(waypoints: string[]): number {
    if (waypoints.length < 2) {
      return 0;
    }

    let totalDistance = 0;

    // For each consecutive pair of waypoints, find the shortest path
    for (let i = 0; i < waypoints.length - 1; i++) {
      const fromId = waypoints[i];
      const toId = waypoints[i + 1];

      // Find shortest path between this pair using Dijkstra
      const result = this.dijkstra(fromId, toId);

      if (result === null) {
        // No path exists between these waypoints
        // Return infinity to indicate invalid route
        return Number.POSITIVE_INFINITY;
      }

      totalDistance += result.distance;
    }

    return totalDistance;
  }

  /**
   * Calculate the straight-line (Euclidean) distance between two controls.
   *
   * @param c1 - First control
   * @param c2 - Second control
   * @returns Distance in meters
   */
  calculateStraightLineDistance(c1: Control, c2: Control): number {
    const p1 = this.getCoordinates(c1);
    const p2 = this.getCoordinates(c2);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy) * this.mapScale * MM_TO_METERS;
  }

  /**
   * Calculate the shortest route distance between two controls.
   * Falls back to straight-line distance if no path exists.
   *
   * @param fromControl - Starting control
   * @param toControl - Ending control
   * @returns Distance in meters
   */
  calculateRouteDistance(fromControl: Control, toControl: Control): number {
    const fromNodeId = this.controlNodeMap.get(fromControl.id);
    const toNodeId = this.controlNodeMap.get(toControl.id);

    if (!fromNodeId || !toNodeId) {
      return this.calculateStraightLineDistance(fromControl, toControl);
    }

    const result = this.dijkstra(fromNodeId, toNodeId);
    return result?.distance ?? this.calculateStraightLineDistance(fromControl, toControl);
  }

  /**
   * Calculate the total length of a course by summing leg distances.
   *
   * @param controls - Ordered array of controls on the course
   * @returns Total course length in meters
   */
  calculateCourseLength(controls: Control[]): number {
    let total = 0;

    for (let i = 0; i < controls.length - 1; i++) {
      total += this.calculateRouteDistance(controls[i], controls[i + 1]);
    }

    return total;
  }

  // ---------------------------------------------------------------------------
  // Shortest Path Algorithm (Dijkstra)
  // ---------------------------------------------------------------------------

  /**
   * Find the shortest path between two nodes using Dijkstra's algorithm.
   *
   * The algorithm builds an adjacency list from edges, then explores nodes
   * in order of increasing distance from the start until reaching the end.
   *
   * Time complexity: O((V + E) log V) with priority queue, currently O(V²)
   * due to linear minimum finding (acceptable for typical graph sizes).
   *
   * @param startNodeId - Starting node ID
   * @param endNodeId - Target node ID
   * @param penalties - Optional penalties to apply to edge costs
   * @returns PathResult with distance and path, or null if no path exists
   */
  dijkstra(startNodeId: string, endNodeId: string, penalties?: Map<string, number>): PathResult | null {
    // Build adjacency list: nodeId -> Map<neighborId, distance>
    const graph = this.buildAdjacencyList(penalties);

    // Ensure start and end nodes exist in the graph
    if (!graph.has(startNodeId)) {
      graph.set(startNodeId, new Map());
    }
    if (!graph.has(endNodeId)) {
      graph.set(endNodeId, new Map());
    }

    // Initialize distance tracking
    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const unvisited = new Set<string>();

    // Set initial distances: 0 for start, Infinity for all others
    distances.set(startNodeId, 0);
    graph.forEach((_, nodeId) => {
      if (nodeId !== startNodeId) {
        distances.set(nodeId, Infinity);
      }
      unvisited.add(nodeId);
    });

    // Main loop: process nodes in order of distance
    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      const minNode = this.findMinDistanceNode(unvisited, distances);
      if (!minNode) break;

      const minDist = distances.get(minNode) ?? Infinity;

      // If we can't reach any more nodes, or we've reached the destination, stop
      if (minDist === Infinity) break;
      if (minNode === endNodeId) break;

      unvisited.delete(minNode);

      // Update distances to neighbors
      const neighbors = graph.get(minNode);
      if (neighbors) {
        neighbors.forEach((edgeWeight, neighborId) => {
          if (!unvisited.has(neighborId)) return;

          const altDist = minDist + edgeWeight;
          if (altDist < (distances.get(neighborId) ?? Infinity)) {
            distances.set(neighborId, altDist);
            previous.set(neighborId, minNode);
          }
        });
      }
    }

    // Reconstruct path by following previous pointers
    return this.reconstructPath(startNodeId, endNodeId, distances, previous);
  }

  /**
   * Build an adjacency list representation of the graph.
   * Maps each node to its neighbors with edge distances.
   */
  private buildAdjacencyList(penalties?: Map<string, number>): Map<string, Map<string, number>> {
    const graph = new Map<string, Map<string, number>>();

    for (const edge of this.edges) {
      const fromNode = this.findNodeOrControl(edge.from);
      const toNode = this.findNodeOrControl(edge.to);

      if (!fromNode || !toNode) continue;

      // Ensure both nodes have entries in the graph
      if (!graph.has(edge.from)) {
        graph.set(edge.from, new Map());
      }
      if (!graph.has(edge.to)) {
        graph.set(edge.to, new Map());
      }

      // Add forward edge
      const distance = this.calculateEdgeDistanceMeters(edge, fromNode, toNode, penalties);
      if (Number.isFinite(distance)) {
        const forwardMap = graph.get(edge.from)!;
        const existing = forwardMap.get(edge.to);
        if (existing === undefined || distance < existing) {
          forwardMap.set(edge.to, distance);
        }
      }

      // Add reverse edge for bidirectional edges
      if (!edge.oneWay) {
        // Warning: This re-uses 'edge' object.
        // calculateEdgeDistanceMeters uses 'edge.from' and 'edge.to' for penalty lookup.
        // For reverse direction, we must ensure penalty lookup matches the traversal direction if we want direction-specific penalties.
        // Or we assume penalties are symmetric or keyed correctly.
        // Current implementation: calculateEdgeDistanceMeters uses edge.from/to from the object.
        // But for reverse path (to->from), we are logically traversing "to"->"from".
        // The 'edge' object still says "from"->"to".

        // Let's rely on the fact that penalties should be symmetric or we construct keys carefully.
        // But calculateEdgeDistanceMeters implementation reads:
        //   const penalty = penalties.get(`${edge.from}:${edge.to}`);
        // This is always the forward key.
        // To support direction specific penalties, we should probably pass the traversal direction to calculateEdgeDistanceMeters?
        // Or cleaner: penalties should be applied to the 'result' distance regardless, based on traversal.

        // Actually, my calculateEdgeDistanceMeters update only looks at edge.from:edge.to.
        // This means it PENALIZES the edge object itself (forward key).
        // If I want to penalize usage in ANY direction, this is fine, provided I don't need directional penalties.
        // For "stairs used", it doesn't matter which way you went, we want to penalize that stair.

        const reverseDistance = this.calculateEdgeDistanceMeters(edge, toNode, fromNode, penalties);
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

  /**
   * Find the unvisited node with minimum distance.
   * Helper for Dijkstra's algorithm.
   */
  private findMinDistanceNode(unvisited: Set<string>, distances: Map<string, number>): string | null {
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

  /**
   * Reconstruct the path from Dijkstra's previous pointer map.
   */
  private reconstructPath(
    startNodeId: string,
    endNodeId: string,
    distances: Map<string, number>,
    previous: Map<string, string>,
  ): PathResult | null {
    const distance = distances.get(endNodeId) ?? Infinity;

    // No path exists if distance is infinite
    if (distance === Infinity) {
      return null;
    }

    // Build path by following previous pointers backward
    const path: string[] = [];
    let current: string | undefined = endNodeId;

    while (current) {
      path.unshift(current);
      current = previous.get(current);
    }

    // Verify path starts at the start node
    if (path[0] !== startNodeId) {
      return null;
    }

    return { distance, path };
  }

  /**
   * Find the shortest path between two controls.
   * Uses the control-to-node mapping to connect controls to the graph.
   *
   * @param fromControl - Starting control
   * @param toControl - Target control
   * @returns PathResult with distance and path, or null if no path exists
   */
  findShortestPathBetweenControls(fromControl: Control, toControl: Control): PathResult | null {
    const fromNodeId = this.controlNodeMap.get(fromControl.id);
    const toNodeId = this.controlNodeMap.get(toControl.id);

    if (!fromNodeId || !toNodeId) {
      return null;
    }

    return this.dijkstra(fromNodeId, toNodeId);
  }

  // ---------------------------------------------------------------------------
  // Path Metrics Counting Methods
  // ---------------------------------------------------------------------------

  /**
   * Count the number of one-way edges in a path.
   * One-way edges add difficulty as runners must recognize the constraint.
   *
   * @param path - Array of node IDs forming the path
   * @returns Number of one-way edges traversed
   */
  countOneWayEdgesInPath(path: string[]): number {
    let count = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.findEdge(path[i], path[i + 1]);
      if (edge?.oneWay) {
        count++;
      }
    }

    return count;
  }

  /**
   * Count the number of ignoreLength edges (stairs) in a path.
   * These represent level changes in indoor orienteering.
   *
   * @param path - Array of node IDs forming the path
   * @returns Number of ignoreLength edges traversed
   */
  countIgnoreLengthEdgesInPath(path: string[]): number {
    let count = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.findEdge(path[i], path[i + 1]);
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
   *
   * @param path - Array of node IDs forming the path
   * @returns Total number of alternative edges (routes not taken)
   */
  countAlternativeEdgesInPath(path: string[]): number {
    let totalAlternativeEdges = 0;
    const deadEndEdgeIds = this.getDeadEndEdgeIds();

    for (let i = 0; i < path.length - 1; i++) {
      const nodeId = path[i];
      const nextNodeId = path[i + 1];
      const incomingNodeId = i > 0 ? path[i - 1] : null;

      // Count non-dead-end alternative outgoing edges (excluding path edge and incoming)
      const alternatives = (this.nodeEdges.get(nodeId) || []).filter((e: Edge) => {
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

  // ---------------------------------------------------------------------------
  // Difficulty Calculation Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the polygon for a node or control position.
   */
  private getPolygonForNodeOrControl(nodeOrControl: Node | Control): Polygon | undefined {
    if (this.polygons.length === 0) return undefined;
    const point = {
      x: (nodeOrControl as any).x ?? (nodeOrControl as any).mapPosition?.x,
      y: (nodeOrControl as any).y ?? (nodeOrControl as any).mapPosition?.y,
    };
    if (point.x === undefined || point.y === undefined) return undefined;
    return findPolygonForPoint(point, this.polygons);
  }

  /**
   * Build an array of polygons for each node in a path.
   * Indices match the path array.
   */
  private buildPathPolygons(path: string[]): (Polygon | undefined)[] {
    return path.map((nodeId) => {
      const node = this.findNodeOrControl(nodeId);
      return node ? this.getPolygonForNodeOrControl(node) : undefined;
    });
  }

  /**
   * Calculate total climb for a path.
   * Based on elevation differences when nodes are on different levels.
   * 
   * @param path - Array of node IDs forming the path
   * @param pathPolygons - Array of polygons for each node (indices match path)
   * @returns Total climb in meters
   */
  calculatePathClimb(path: string[], pathPolygons: (Polygon | undefined)[]): number {
    let totalClimb = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const fromPolygon = pathPolygons[i];
        const toPolygon = pathPolygons[i + 1];
        
        // Get elevations from polygons
        const fromElevation = fromPolygon?.elevation ?? (fromPolygon?.level ?? 0) * 3;
        const toElevation = toPolygon?.elevation ?? (toPolygon?.level ?? 0) * 3;
        
        // Add climb if going up
        if (toElevation > fromElevation) {
            totalClimb += (toElevation - fromElevation);
        }
    }
    return totalClimb;
  }

  /**
   * Calculate the difficulty score for a path using the configured scoring model.
   *
   * @param path - Array of node IDs forming the path
   * @returns Numeric difficulty score
   */
  /**
   * Build a RouteContext for the shared scoring/analysis functions.
   */
  private buildRouteContext(path: string[]) {
    return {
      controls: this.controls,
      nodes: this.nodes,
      edges: this.edges,
      path,
      mapScale: this.mapScale,
      polygons: this.polygons,
      edgeLookup: this.edgeLookup,
      nodeEdges: this.nodeEdges,
      nodeControlMap: this.nodeControlMap,
    };
  }

  calculatePathDifficulty(path: string[]): number {
    return this.scoringModel.calculateDifficulty(this.buildRouteContext(path));
  }

  /**
   * Calculate a detailed breakdown of difficulty factors for a path.
   *
   * @param path - Array of node IDs forming the path
   * @returns LegDifficulty with individual factor scores
   */
  calculateLegDifficulty(path: string[]): LegDifficulty {
    const oneWay = this.countOneWayEdgesInPath(path);
    const stairs = this.countIgnoreLengthEdgesInPath(path);
    const alternativeEdges = this.countAlternativeEdgesInPath(path);

    return {
      oneWay,
      alternativeEdges,
      stairs,
      total: oneWay + alternativeEdges + stairs,
    };
  }

  /**
   * Calculate the difficulty score for the leg between two controls.
   *
   * @param fromControl - Starting control
   * @param toControl - Ending control
   * @returns Difficulty score, or 0 if no path exists
   */
  calculateLegDifficultyBetweenControls(fromControl: Control, toControl: Control): number {
    const fromNodeId = this.controlNodeMap.get(fromControl.id);
    const toNodeId = this.controlNodeMap.get(toControl.id);

    if (!fromNodeId || !toNodeId) return 0;

    const result = this.dijkstra(fromNodeId, toNodeId);
    if (!result) return 0;

    return this.calculatePathDifficulty(result.path);
  }

  /**
   * Calculate a detailed difficulty breakdown for the leg between two controls.
   *
   * @param fromControl - Starting control
   * @param toControl - Ending control
   * @returns LegDifficulty breakdown
   */
  calculateDetailedLegDifficultyBetweenControls(fromControl: Control, toControl: Control): LegDifficulty {
    const fromNodeId = this.controlNodeMap.get(fromControl.id);
    const toNodeId = this.controlNodeMap.get(toControl.id);

    if (!fromNodeId || !toNodeId) {
      return { oneWay: 0, alternativeEdges: 0, stairs: 0, total: 0 };
    }

    const result = this.dijkstra(fromNodeId, toNodeId);
    if (!result) {
      return { oneWay: 0, alternativeEdges: 0, stairs: 0, total: 0 };
    }

    return this.calculateLegDifficulty(result.path);
  }

  /**
   * Calculate the total difficulty for an entire course.
   *
   * @param controls - Ordered array of controls on the course
   * @returns Sum of all leg difficulties
   */
  calculateCourseDifficulty(controls: Control[]): number {
    let totalDifficulty = 0;

    for (let i = 0; i < controls.length - 1; i++) {
      totalDifficulty += this.calculateLegDifficultyBetweenControls(controls[i], controls[i + 1]);
    }

    return totalDifficulty;
  }

  // ---------------------------------------------------------------------------
  // Route Analysis Methods
  // ---------------------------------------------------------------------------

  /**
   * Analyze a route for decision points and alternative edges.
   *
   * Decision points are computed by the shared {@link analyzeDecisionPoints}
   * function.  Alternative edges are edges at each node that are not part
   * of the route (dead-end edges excluded).
   *
   * @param path - Array of node IDs forming the path
   * @returns Object with decisionPoints, decisionPointNodeIds, and alternativeEdges counts
   */
  analyzeRoute(path: string[]): { decisionPoints: number; decisionPointNodeIds: string[]; alternativeEdges: number } {
    // Decision points — delegate to the shared function
    const context = this.buildRouteContext(path);
    const dpAnalysis = analyzeDecisionPoints(context);

    // Alternative edges — count non-route, non-dead-end edges at each node
    let alternativeEdges = 0;
    const deadEndEdgeIds = this.getDeadEndEdgeIds();

    const pathEdgeIds = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.findEdge(path[i], path[i + 1]);
      if (edge) pathEdgeIds.add(edgeKey(edge));
    }

    for (let i = 0; i < path.length; i++) {
      const nodeId = path[i];
      const connectedEdges = this.nodeEdges.get(nodeId) || [];

      // Track which edges are part of the route at this node
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

      // Count unique non-dead-end edges at this node
      let totalEdgesAtNode = 0;
      const countedEdges = new Set<string>();

      for (const edge of connectedEdges) {
        if (deadEndEdgeIds.has(edgeKey(edge)) && !pathEdgeIds.has(edgeKey(edge))) continue;
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
      alternativeEdges,
    };
  }

  // ---------------------------------------------------------------------------
  // Level Validation Methods
  // ---------------------------------------------------------------------------
  // Route Description Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the sequence of edge labels for a path.
   */
  getRouteLabels(path: string[]): string[] {
    const labels: string[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const fromNodeId = path[i];
      const toNodeId = path[i + 1];
      const edge = this.findEdge(fromNodeId, toNodeId);

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

  /**
   * Generate a human-readable description of a route from edge labels.
   *
   * @param path - Array of node IDs forming the path
   * @returns Comma-separated string of edge labels
   */
  getRouteDescription(path: string[]): string {
    return this.getRouteLabels(path).join(", ");
  }

  /**
   * Get the sequence of stair labels for a path.
   * Used to identify routes with unique stair choices.
   *
   * @param path - Array of node IDs forming the path
   * @returns Comma-separated string of stair edge labels
   */
  getStairSequence(path: string[]): string {
    const stairLabels: string[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const fromNodeId = path[i];
      const toNodeId = path[i + 1];
      const edge = this.findEdge(fromNodeId, toNodeId);

      if (edge) {
        const isReverse = edge.from === toNodeId && edge.to === fromNodeId;
        const label = isReverse && edge.reverseLabel ? edge.reverseLabel : edge.label;
        if (label) {
        stairLabels.push(label);
        }
      }
    }

    return stairLabels.join(",");
  }

  // ---------------------------------------------------------------------------
  // Alternative Path Finding (K-Shortest Paths)
  // ---------------------------------------------------------------------------

  /**
   * Find alternative paths between two nodes using an iterative penalty method.
   *
   * Algorithm:
   * 1. Find shortest path with current weights.
   * 2. If new valid route found, add to results.
   * 3. Penalize edges used in the found path (heavier penalty for stairs).
   * 4. Repeat until k paths found or limits reached.
   *
   * This method effectively finds routes that are topologically different,
   * especially prioritizing different stair sequences.
   *
   * @param startNodeId - Starting node ID
   * @param endNodeId - Target node ID
   * @param k - Maximum number of paths to return (default: 6)
   * @param fromControlId - Optional control ID for path visualization
   * @param toControlId - Optional control ID for path visualization
   * @param includeVariations - If true, returns all found paths including minor variations (same stair sequence)
   * @returns Array of RouteInfo objects, sorted by distance
   */
  findAlternativePaths(
    startNodeId: string,
    endNodeId: string,
    k: number = 6,
    fromControlId?: string,
    toControlId?: string,
  ): RouteInfo[] {
    const paths: RouteInfo[] = [];
    const uniquePathStrings = new Set<string>();
    const edgePenalties = new Map<string, number>();

    const MAX_ITERATIONS = 200;
    const effectiveK = Math.max(k, 50);

    // Iterative Penalty Method
    for (let i = 0; i < MAX_ITERATIONS && paths.length < effectiveK; i++) {
      const currentPath = this.dijkstra(startNodeId, endNodeId, edgePenalties);
      if (!currentPath) break;

      // Uniqueness check:
      // Create a string representation of the path (comma-separated node IDs).
      // This allows efficient checking if we have already found this exact sequence of nodes.
      const pathString = currentPath.path.join(",");
      const isNewPath = !uniquePathStrings.has(pathString);

      if (isNewPath) {
        uniquePathStrings.add(pathString);
        const pathWithControls = this.addControlsToPath(currentPath.path, fromControlId, toControlId);
        paths.push(this.buildRouteInfo(pathWithControls, fromControlId, toControlId));
      }

      // Apply penalties to edges in this path to force exploration of other routes
      // We do this even if the path was duplicate, to push the algorithm out of the local minimum
      for (let j = 0; j < currentPath.path.length - 1; j++) {
        const u = currentPath.path[j];
        const v = currentPath.path[j + 1];
        const edge = this.findEdge(u, v);

        if (edge) {
          const key = `${edge.from}:${edge.to}`;
          const currentPenalty = edgePenalties.get(key) || 1.0;

          // Check if this is a level change edge by comparing polygon levels
          const fromNode = this.findNodeOrControl(u);
          const toNode = this.findNodeOrControl(v);
          const fromPolygon = fromNode ? this.getPolygonForNodeOrControl(fromNode) : undefined;
          const toPolygon = toNode ? this.getPolygonForNodeOrControl(toNode) : undefined;
          const isLevelChange = (fromPolygon?.level ?? 0) !== (toPolygon?.level ?? 0);

          // Stronger penalty for stairs (level change edges) to encourage finding different stair routes
          const factor = isLevelChange ? 5.0 : 1.2;
          edgePenalties.set(key, currentPenalty * factor);
        }
      }

      // If we found a new path, we might want to continue searching from the base graph?
      // No, in penalty method, we keep accumulating penalties to find the "next" best.
    }

    // Sort by actual distance (re-scored without penalties)
    return paths.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Add control IDs to the beginning and end of a path for visualization.
   */
  private addControlsToPath(path: string[], fromControlId?: string, toControlId?: string): string[] {
    if (fromControlId && toControlId) {
      return [fromControlId, ...path, toControlId];
    }
    return path;
  }

  /**
   * Build a complete RouteInfo object from a path.
   */
  private buildRouteInfo(path: string[], _fromControlId?: string, _toControlId?: string): RouteInfo {
    const distance = this.calculatePathDistance(path);
    const pathPolygons = this.buildPathPolygons(path);
    const analysis = this.analyzeRoute(path);
    const labels = this.getRouteLabels(path);
    const description = labels.join(", ");
    const oneWayEdges = this.countOneWayEdgesInPath(path);
    const ignoreLengthEdges = this.countIgnoreLengthEdgesInPath(path);
    const difficulty = this.calculatePathDifficulty(path);
    const totalClimb = this.calculatePathClimb(path, pathPolygons);

    return {
      distance,
      path,
      pathPolygons,
      decisionPoints: analysis.decisionPoints,
      decisionPointNodeIds: analysis.decisionPointNodeIds,
      alternativeEdges: analysis.alternativeEdges,
      oneWayEdges,
      ignoreLengthEdges,
      description,
      labels,
      difficulty,
      totalClimb,
    };
  }

  /**
   * Find alternative paths between two controls.
   *
   * This is the main entry point for finding route alternatives.
   * Handles both direct edges between controls and paths through the graph.
   *
   * @param fromControlId - Starting control ID
   * @param toControlId - Destination control ID
   * @param k - Maximum number of paths to return (default: 6)
   * @param includeVariations - If true, returns all found paths including minor variations (same stair sequence)
   * @returns Array of RouteInfo objects with unique stair sequences
   */
  findAlternativePathsBetweenControls(fromControlId: string, toControlId: string, k: number = 6): RouteInfo[] {
    // Check if there's a direct edge between controls
    const directEdge = this.edges.find(
      (e) =>
        (e.from === fromControlId && e.to === toControlId) ||
        (!e.oneWay && e.from === toControlId && e.to === fromControlId),
    );

    const fromNodeId = this.controlNodeMap.get(fromControlId);
    const toNodeId = this.controlNodeMap.get(toControlId);

    // Use direct edge if available, otherwise use mapped nodes
    const startId = directEdge ? fromControlId : fromNodeId || fromControlId;
    const endId = directEdge ? toControlId : toNodeId || toControlId;

    return this.findAlternativePaths(startId, endId, k, fromControlId, toControlId);
  }

  /**
   * Find ALL alternative paths between two controls that produce distinct label sequences.
   *
   * Uses a two-phase approach:
   * 1. Build a cluster graph where nodes connected by unlabeled edges are merged
   *    into clusters (Union-Find). Labeled (stair) edges become edges between clusters.
   * 2. Enumerate all distinct label sequences via DFS on the cluster graph.
   *    Each underlying labeled edge may be used at most once (in either direction),
   *    which naturally prevents loops while allowing cluster revisits via different stairs.
   * 3. For each unique sequence, stitch a concrete path using unlabeled-only BFS
   *    between waypoints.
   *
   * @param fromControlId - Starting control ID
   * @param toControlId - Destination control ID
   * @param maxResults - Maximum number of routes to return (default: 200)
   * @returns Array of RouteInfo objects with unique label sequences, sorted by distance
   */
  findAllAlternativePathsBetweenControls(fromControlId: string, toControlId: string, maxResults: number = 200): RouteInfo[] {
    const fromNodeId = this.controlNodeMap.get(fromControlId);
    const toNodeId = this.controlNodeMap.get(toControlId);

    if (!fromNodeId || !toNodeId) return [];

    // -------------------------------------------------------------------------
    // Phase 1: Union-Find with path compression
    // Merge nodes connected by unlabeled edges into clusters.
    // -------------------------------------------------------------------------
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      if (!parent.has(x)) parent.set(x, x);
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      // Path compression
      let cur = x;
      while (cur !== root) {
        const next = parent.get(cur)!;
        parent.set(cur, root);
        cur = next;
      }
      return root;
    };
    const union = (a: string, b: string): void => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // Initialize all nodes and controls
    for (const node of this.nodes) parent.set(node.id, node.id);
    for (const control of this.controls) parent.set(control.id, control.id);

    // Union nodes connected by bidirectional unlabeled edges (non-stair corridors).
    // One-way unlabeled edges are NOT unioned — they become directed cluster edges
    // so that BFS within a cluster is always bidirectionally reachable.
    for (const edge of this.edges) {
      if ((!edge.label || edge.label === '') && !edge.oneWay) {
        union(edge.from, edge.to);
      }
    }

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

    for (const edge of this.edges) {
      const hasLabel = edge.label && edge.label !== '';
      const isOneWayUnlabeled = !hasLabel && !!edge.oneWay;

      // Skip bidirectional unlabeled edges — they're within clusters
      if (!hasLabel && !isOneWayUnlabeled) continue;

      const fc = find(edge.from);
      const tc = find(edge.to);
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

    const startCluster = find(fromNodeId);
    const endCluster = find(toNodeId);

    // -------------------------------------------------------------------------
    // Phase 3: DFS on cluster graph to enumerate all distinct label sequences.
    // Constraint: each underlying labeled edge (by edge ID) used at most once.
    // This prevents loops while allowing a cluster to be revisited via different stairs.
    // Cap the number of unique sequences to keep stitching + route-info computation fast.
    // -------------------------------------------------------------------------
    const MAX_LABEL_DEPTH = 25;
    const MAX_SEQUENCES = 5000;
    const MAX_DFS_CALLS = 100_000;
    const uniqueLabelSeqs = new Map<string, Array<{ from: string; to: string }>>();
    let dfsCallCount = 0;

    const dfs = (
      cluster: string,
      labels: string[],
      waypoints: Array<{ from: string; to: string }>,
      usedEdgeIds: Set<string>,
    ) => {
      dfsCallCount++;
      if (uniqueLabelSeqs.size >= MAX_SEQUENCES || dfsCallCount >= MAX_DFS_CALLS) return;

      // If we reached the end cluster, record the label sequence
      if (cluster === endCluster) {
        const seq = labels.join(",");
        if (!uniqueLabelSeqs.has(seq)) {
          uniqueLabelSeqs.set(seq, [...waypoints]);
        }
        // Don't return — allow continuing through to find longer routes
      }

      if (labels.length >= MAX_LABEL_DEPTH) return;

      const clusterEdges = clusterAdj.get(cluster);
      if (!clusterEdges) return;

      for (const e of clusterEdges) {
        // Each physical stair edge can only be used once (in either direction)
        if (usedEdgeIds.has(e.edgeId)) continue;

        usedEdgeIds.add(e.edgeId);
        labels.push(e.label);
        waypoints.push({ from: e.fromNode, to: e.toNode });

        dfs(e.toCluster, labels, waypoints, usedEdgeIds);

        labels.pop();
        waypoints.pop();
        usedEdgeIds.delete(e.edgeId);
      }
    };

    dfs(startCluster, [], [], new Set());

    // -------------------------------------------------------------------------
    // Phase 4: Build unlabeled-only adjacency with edge weights for Dijkstra
    // -------------------------------------------------------------------------
    interface UnlabeledEdge { to: string; weight: number; }
    const unlabeledAdj = new Map<string, UnlabeledEdge[]>();

    for (const edge of this.edges) {
      if (edge.label && edge.label !== '') continue;

      // Compute distance weight for this edge
      const fromNode = this.findNodeOrControl(edge.from);
      const toNode = this.findNodeOrControl(edge.to);
      const weight = (fromNode && toNode)
        ? this.calculateEdgeDistanceMeters(edge, fromNode, toNode)
        : 1;

      if (!unlabeledAdj.has(edge.from)) unlabeledAdj.set(edge.from, []);
      unlabeledAdj.get(edge.from)!.push({ to: edge.to, weight });
      if (!edge.oneWay) {
        if (!unlabeledAdj.has(edge.to)) unlabeledAdj.set(edge.to, []);
        unlabeledAdj.get(edge.to)!.push({ to: edge.from, weight });
      }
    }

    // Dijkstra pathfinding using only unlabeled edges (distance-weighted).
    // Uses a binary heap for O((V+E) log V) performance.
    const dijkstraCache = new Map<string, string[] | null>();
    const findUnlabeledPath = (from: string, to: string): string[] | null => {
      if (from === to) return [from];
      const cacheKey = `${from}:${to}`;
      if (dijkstraCache.has(cacheKey)) return dijkstraCache.get(cacheKey)!;

      const dist = new Map<string, number>([[from, 0]]);
      const prev = new Map<string, string>();
      const visited = new Set<string>();

      // Min-heap using array (elements: [distance, nodeId])
      const heap: [number, string][] = [[0, from]];
      const heapPush = (d: number, node: string) => {
        heap.push([d, node]);
        let i = heap.length - 1;
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (heap[parent][0] <= heap[i][0]) break;
          [heap[parent], heap[i]] = [heap[i], heap[parent]];
          i = parent;
        }
      };
      const heapPop = (): [number, string] | undefined => {
        if (heap.length === 0) return undefined;
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length > 0) {
          heap[0] = last;
          let i = 0;
          while (true) {
            let smallest = i;
            const l = 2 * i + 1, r = 2 * i + 2;
            if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
            if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
            if (smallest === i) break;
            [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
            i = smallest;
          }
        }
        return top;
      };

      while (heap.length > 0) {
        const [d, current] = heapPop()!;
        if (visited.has(current)) continue;
        if (current === to) {
          const path: string[] = [];
          let n: string | undefined = to;
          while (n !== undefined) {
            path.unshift(n);
            n = prev.get(n);
          }
          dijkstraCache.set(cacheKey, path);
          return path;
        }
        visited.add(current);

        for (const { to: neighbor, weight } of (unlabeledAdj.get(current) || [])) {
          if (visited.has(neighbor)) continue;
          const newDist = d + weight;
          if (newDist < (dist.get(neighbor) ?? Infinity)) {
            dist.set(neighbor, newDist);
            prev.set(neighbor, current);
            heapPush(newDist, neighbor);
          }
        }
      }

      dijkstraCache.set(cacheKey, null);
      return null;
    };

    // -------------------------------------------------------------------------
    // Phase 5: Stitch waypoints into concrete node-level paths
    // Cap results since buildRouteInfo is expensive per call.
    // -------------------------------------------------------------------------
    const MAX_RESULTS = maxResults;
    const results: RouteInfo[] = [];
    const seenDescriptions = new Set<string>();

    // Handle the direct unlabeled path (may cross one-way edges within/between clusters).
    // Always attempt this regardless of cluster structure, since unlabeledAdj
    // includes one-way edges in their forward direction.
    const directPath = findUnlabeledPath(fromNodeId, toNodeId);
    if (directPath) {
      const pathWithControls = this.addControlsToPath(directPath, fromControlId, toControlId);
      const routeInfo = this.buildRouteInfo(pathWithControls, fromControlId, toControlId);
      const desc = routeInfo.labels.join(",");
      if (!seenDescriptions.has(desc)) {
        seenDescriptions.add(desc);
        results.push(routeInfo);
      }
    }

    // Sort sequences by label count so simpler routes (fewer stairs) are stitched first.
    // This ensures the MAX_RESULTS cap doesn't skip short, relevant routes.
    const sortedSeqs = [...uniqueLabelSeqs.entries()].sort(
      (a, b) => a[1].length - b[1].length,
    );

    for (const [, waypoints] of sortedSeqs) {
      if (results.length >= MAX_RESULTS) break;
      if (waypoints.length === 0) continue; // handled by the direct-path block above

      const fullPath: string[] = [];
      let valid = true;

      // Start node → first waypoint's fromNode (unlabeled path)
      const startSeg = findUnlabeledPath(fromNodeId, waypoints[0].from);
      if (!startSeg) continue;
      fullPath.push(...startSeg);

      for (let i = 0; i < waypoints.length; i++) {
        // Add the labeled edge crossing
        fullPath.push(waypoints[i].to);

        // Connect to next waypoint's fromNode (unlabeled path within cluster)
        if (i < waypoints.length - 1) {
          const midSeg = findUnlabeledPath(waypoints[i].to, waypoints[i + 1].from);
          if (!midSeg) { valid = false; break; }
          fullPath.push(...midSeg.slice(1));
        }
      }

      if (!valid) continue;

      // Last waypoint's toNode → end node (unlabeled path)
      const endSeg = findUnlabeledPath(waypoints[waypoints.length - 1].to, toNodeId);
      if (!endSeg) continue;
      fullPath.push(...endSeg.slice(1));

      // Dedup by actual label description
      const actualLabels = this.getRouteLabels(fullPath);
      const desc = actualLabels.join(",");
      if (seenDescriptions.has(desc)) continue;
      seenDescriptions.add(desc);

      const pathWithControls = this.addControlsToPath(fullPath, fromControlId, toControlId);
      results.push(this.buildRouteInfo(pathWithControls, fromControlId, toControlId));
    }

    return results.sort((a, b) => a.distance - b.distance);
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the graph node ID mapped to a control.
   *
   * @param controlId - The control ID
   * @returns The nearest node ID, or undefined if not mapped
   */
  getNodeIdForControl(controlId: string): string | undefined {
    return this.controlNodeMap.get(controlId);
  }


  /**
   * Get the set of edge keys visited by a route path.
   * Uses sorted node IDs "min:max" to identify edges regardless of direction.
   * 
   * @param path - The node IDs of the route
   * @returns Array of unique edge keys
   */
  /**
   * Calculate the Repetition Ratio for a route.
   * Percentage of route length that consists of edges visited in previous legs' shortest routes.
   * 
   * @param path - The node IDs of the route to analyze
   * @param previousRoutes - Array of paths (node IDs) from previous legs
   * @returns The ratio (0-1)
   */
  calculateRepetitionRatio(path: string[], previousRoutes: string[][]): number {
    if (!previousRoutes || previousRoutes.length === 0 || path.length < 2) {
      return 0;
    }

    let intersectionLength = 0;
    let totalLength = 0;

    // Create a set of visited edge keys for O(1) lookup
    // Key format: "u:v" where u < v to handle directionality
    const visitedEdges = new Set<string>();
    
    for (const routePath of previousRoutes) {
      if (routePath.length < 2) continue;
      for (let i = 0; i < routePath.length - 1; i++) {
        const u = routePath[i];
        const v = routePath[i+1];
        // Normalize key by sorting IDs to handle bidirectional matching
        // We use a custom separator that is unlikely to be in IDs
        const key = u < v ? `${u}|${v}` : `${v}|${u}`;
        visitedEdges.add(key);
      }
    }

    for (let i = 0; i < path.length - 1; i++) {
        const u = path[i];
        const v = path[i+1];
        const edge = this.findEdge(u, v); 
        
        if (edge) {
            const fromNode = this.findNodeOrControl(u);
            const toNode = this.findNodeOrControl(v);
            const dist = this.calculateEdgeDistanceMeters(edge, fromNode, toNode);

            totalLength += dist;
            
            const key = u < v ? `${u}|${v}` : `${v}|${u}`;
            if (visitedEdges.has(key)) {
                intersectionLength += dist;
            }
        }
    }
    
    return totalLength > 0 ? intersectionLength / totalLength : 0;
  }

  /**
   * Check if the graph has been populated with edges and nodes.
   *
   * @returns true if the graph has data for pathfinding
   */
  hasGraph(): boolean {
    return this.edges.length > 0 && this.nodes.length > 0;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new RouteAnalyzer instance.
 * Convenience function for creating analyzers without using 'new'.
 *
 * @param controls - Array of control points
 * @param nodes - Array of graph nodes
 * @param edges - Array of edges connecting nodes
 * @param mapScale - Map scale factor
 * @param polygons - Optional array of polygons for elevation lookup
 * @returns A new RouteAnalyzer instance
 */
export function createRouteAnalyzer(
  controls: Control[],
  nodes: Node[],
  edges: Edge[],
  mapScale: number,
  polygons: Polygon[] = []
): RouteAnalyzer {
  return new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, polygons);
}
