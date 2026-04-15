/**
 * Shared RouteContext test fixtures for scoring model tests.
 *
 * Coordinate system:
 *   distance_meters = hypot(dx, dy) * mapScale * 0.001
 *   With mapScale = 5000, 20 map-units ≈ 100 m.
 */
import type { RouteContext } from './base';
import type { Polygon } from '../models/polygon';

export const MAP_SCALE = 5000;

/**
 * Polygons defining three floor levels for level-change tests.
 * Wide enough (x: −50 to 450) to contain all test nodes.
 *   Level 1: y ∈ [−50, 50]
 *   Level 2: y ∈ [50, 150]
 *   Level 3: y ∈ [150, 250]
 */
export const levelPolygons: Polygon[] = [
  { id: "p1", points: [{ x: -50, y: -50 }, { x: 450, y: -50 }, { x: 450, y: 50 }, { x: -50, y: 50 }], level: 1 },
  { id: "p2", points: [{ x: -50, y: 50 }, { x: 450, y: 50 }, { x: 450, y: 150 }, { x: -50, y: 150 }], level: 2 },
  { id: "p3", points: [{ x: -50, y: 150 }, { x: 450, y: 150 }, { x: 450, y: 250 }, { x: -50, y: 250 }], level: 3 },
];

// ─── No decision points ───────────────────────────────────────────────────────

/** Routes from A to B with no decision points (~100 m). */
export const noDecisionPointContexts = {
  /** Single edge A → B, 100 m */
  singleEdge: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 20, y: 0 },
    ],
    edges: [
      { from: "a", to: "b", label: "corridor" },
    ],
    path: ["a", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Two legs: A → n1 → B, 100 m total, no branching */
  twoLegs: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "n1", x: 10, y: 0 },
      { id: "b", x: 20, y: 0 },
    ],
    edges: [
      { from: "a", to: "n1", label: "corridor1" },
      { from: "n1", to: "b", label: "corridor2" },
    ],
    path: ["a", "n1", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Three legs: A → n1 → n2 → B, ~100 m total, no branching */
  threeLegs: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "n1", x: 7, y: 0 },
      { id: "n2", x: 14, y: 0 },
      { id: "b", x: 20, y: 0 },
    ],
    edges: [
      { from: "a", to: "n1", label: "corridor1" },
      { from: "n1", to: "n2", label: "corridor2" },
      { from: "n2", to: "b", label: "corridor3" },
    ],
    path: ["a", "n1", "n2", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Single one-way edge A → B, 100 m */
  oneWay: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 20, y: 0 },
    ],
    edges: [
      { from: "a", to: "b", label: "oneway-corridor", oneWay: true },
    ],
    path: ["a", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,
} as const;

// ─── Decision points ──────────────────────────────────────────────────────────

/** Routes with decision points (branching). */
export const decisionPointContexts = {
  /** 2 exits from n1: n2 (correct), n3 (wrong). n3→n2 closes a triangle (no dead ends). Path: [n1, n2] */
  simpleDecision: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 0, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "correct" },
      { from: "n1", to: "n3", label: "wrong" },
      { from: "n3", to: "n2", label: "loop" },
    ],
    path: ["n1", "n2"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** 4 exits from n1: n2 correct, n3/n4/n5 wrong. All loop back to n2 (no dead ends). Path: [n1, n2] */
  fourChoices: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 0, y: 100 },
      { id: "n4", x: -100, y: 0 },
      { id: "n5", x: 0, y: -100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "correct" },
      { from: "n1", to: "n3", label: "wrong1" },
      { from: "n1", to: "n4", label: "wrong2" },
      { from: "n1", to: "n5", label: "wrong3" },
      { from: "n3", to: "n2", label: "loop1" },
      { from: "n4", to: "n2", label: "loop2" },
      { from: "n5", to: "n2", label: "loop3" },
    ],
    path: ["n1", "n2"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Two separate decision points along a 3-node path. n4→n3 and n5→n3 close loops (no dead ends). */
  twoDecisionPoints: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 200, y: 0 },
      { id: "n4", x: 0, y: 100 },
      { id: "n5", x: 100, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "path1" },
      { from: "n2", to: "n3", label: "path2" },
      { from: "n1", to: "n4", label: "wrong1" },
      { from: "n2", to: "n5", label: "wrong2" },
      { from: "n4", to: "n3", label: "loop1" },
      { from: "n5", to: "n3", label: "loop2" },
    ],
    path: ["n1", "n2", "n3"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Corridor with one alternative branch at n2. n4→n3 closes a loop (no dead ends). Path: [n1, n2, n3] */
  withAlternative: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 200, y: 0 },
      { id: "n4", x: 100, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "corridor1" },
      { from: "n2", to: "n3", label: "corridor2" },
      { from: "n2", to: "n4", label: "corridor3" },
      { from: "n4", to: "n3", label: "loop" },
    ],
    path: ["n1", "n2", "n3"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Same corridor without the alternative (for comparison). */
  withoutAlternative: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 200, y: 0 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "corridor1" },
      { from: "n2", to: "n3", label: "corridor2" },
    ],
    path: ["n1", "n2", "n3"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,
} as const;

// ─── Dead ends ────────────────────────────────────────────────────────────────

/** Routes with dead-end branches off the correct path. */
export const deadEndContexts = {
  /** False arc leads to a chain of 4 nodes (deep dead end). */
  deepChain: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 0, y: 100 },
      { id: "n4", x: 0, y: 200 },
      { id: "n5", x: 0, y: 300 },
      { id: "n6", x: 0, y: 400 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "correct" },
      { from: "n1", to: "n3", label: "wrong" },
      { from: "n3", to: "n4", label: "deadend1" },
      { from: "n4", to: "n5", label: "deadend2" },
      { from: "n5", to: "n6", label: "deadend3" },
    ],
    path: ["n1", "n2"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** False arc leads to a node that branches into two sub-paths. */
  branching: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 0, y: 100 },
      { id: "n4", x: -50, y: 150 },
      { id: "n5", x: 50, y: 150 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "correct" },
      { from: "n1", to: "n3", label: "wrong" },
      { from: "n3", to: "n4", label: "branch1" },
      { from: "n3", to: "n5", label: "branch2" },
    ],
    path: ["n1", "n2"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,
} as const;

// ─── Edge direction ───────────────────────────────────────────────────────────

/** Routes testing edge direction (bidirectional vs one-way) effects. */
export const edgeDirectionContexts = {
  /** Bidirectional edge n3→n1 creates a false arc at n1. n3→n2 closes a loop (no dead ends). Path: [n1, n2] */
  bidirectionalFalseArc: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 0, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "correct" },
      { from: "n3", to: "n1", label: "bidirectional" },
      { from: "n3", to: "n2", label: "loop" },
    ],
    path: ["n1", "n2"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** One-way edge n3→n1 cannot be reversed, so no false arc at n1. Path: [n1, n2] */
  oneWayNotReversible: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 0, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "correct" },
      { from: "n3", to: "n1", label: "oneway", oneWay: true },
    ],
    path: ["n1", "n2"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** One-way first edge, then regular. Path: [n1, n2, n3] */
  oneWayThenRegular: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 200, y: 0 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "oneway", oneWay: true },
      { from: "n2", to: "n3", label: "corridor" },
    ],
    path: ["n1", "n2", "n3"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,
} as const;

// ─── Level changes ────────────────────────────────────────────────────────────

/** Routes involving floor-level changes (include levelPolygons). */
export const levelChangeContexts = {
  /** Upstairs: L1 → L2 (ignoreLength). */
  upstairs: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "stairs", ignoreLength: true },
    ],
    path: ["n1", "n2"],
    mapScale: MAP_SCALE,
    polygons: levelPolygons,
  } satisfies RouteContext,

  /** Downstairs: L2 → L1 (reverse path of upstairs). */
  downstairs: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "stairs", ignoreLength: true },
    ],
    path: ["n2", "n1"],
    mapScale: MAP_SCALE,
    polygons: levelPolygons,
  } satisfies RouteContext,

  /** Corridor on L1 then stairs to L2 (triggers context switch). */
  corridorThenStairs: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 200, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "corridor" },
      { from: "n2", to: "n3", label: "stairs", ignoreLength: true },
    ],
    path: ["n1", "n2", "n3"],
    mapScale: MAP_SCALE,
    polygons: levelPolygons,
  } satisfies RouteContext,

  /** Consecutive stairs: L1 → L2 → L3 (only one context switch at start). */
  consecutiveStairs: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 100 },
      { id: "n3", x: 200, y: 200 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "stairs1", ignoreLength: true },
      { from: "n2", to: "n3", label: "stairs2", ignoreLength: true },
    ],
    path: ["n1", "n2", "n3"],
    mapScale: MAP_SCALE,
    polygons: levelPolygons,
  } satisfies RouteContext,

  /** Corridor → stairs → corridor (context switch then back to normal). */
  corridorStairsCorridor: {
    controls: [],
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 200, y: 100 },
      { id: "n4", x: 300, y: 100 },
    ],
    edges: [
      { from: "n1", to: "n2", label: "corridor" },
      { from: "n2", to: "n3", label: "stairs", ignoreLength: true },
      { from: "n3", to: "n4", label: "corridor" },
    ],
    path: ["n1", "n2", "n3", "n4"],
    mapScale: MAP_SCALE,
    polygons: levelPolygons,
  } satisfies RouteContext,
} as const;

// ─── One-route graphs (no branching, no stairs → difficulty = 0) ─────────────

/**
 * Graphs where there is exactly one possible route between start and end.
 * No branches, no level changes. All scoring models must return 0 for these.
 */
export const oneRouteContexts = {
  /** Single edge A → B */
  singleEdge: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 3, y: 0 },
    ],
    edges: [
      { from: "a", to: "b", label: "corridor" },
    ],
    path: ["a", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Three-node linear corridor: A → n1 → B */
  threeNodes: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "n1", x: 3, y: 0 },
      { id: "b", x: 6, y: 0 },
    ],
    edges: [
      { from: "a", to: "n1", label: "c1" },
      { from: "n1", to: "b", label: "c2" },
    ],
    path: ["a", "n1", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Five-node linear corridor: A → n1 → n2 → n3 → B */
  fiveNodes: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "n1", x: 3, y: 0 },
      { id: "n2", x: 6, y: 0 },
      { id: "n3", x: 9, y: 0 },
      { id: "b", x: 12, y: 0 },
    ],
    edges: [
      { from: "a", to: "n1", label: "c1" },
      { from: "n1", to: "n2", label: "c2" },
      { from: "n2", to: "n3", label: "c3" },
      { from: "n3", to: "b", label: "c4" },
    ],
    path: ["a", "n1", "n2", "n3", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** L-shaped corridor (turns but no branches): A → n1 → B */
  lShaped: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "n1", x: 3, y: 0 },
      { id: "b", x: 3, y: 3 },
    ],
    edges: [
      { from: "a", to: "n1", label: "c1" },
      { from: "n1", to: "b", label: "c2" },
    ],
    path: ["a", "n1", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** One-way linear corridor (one-way edges, still single route): A → n1 → B */
  oneWayCorridor: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "n1", x: 3, y: 0 },
      { id: "b", x: 6, y: 0 },
    ],
    edges: [
      { from: "a", to: "n1", label: "c1", oneWay: true },
      { from: "n1", to: "b", label: "c2", oneWay: true },
    ],
    path: ["a", "n1", "b"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,
} as const;

// ─── Dead-end filtering ──────────────────────────────────────────────────────

/**
 * Test fixtures for verifying that dead-end paths are excluded from
 * difficulty scoring. A dead-end spur off a cycle should not add
 * decision-point complexity.
 */
export const deadEndFilterContexts = {
  /** Cycle A→B→C→A with dead-end spur B→D. Path: [A, B, C].
   *  At B, exit to D is a dead-end and should be excluded. */
  cycleWithSpur: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 50, y: 100 },
      { id: "d", x: 200, y: 0 },
    ],
    edges: [
      { from: "a", to: "b", label: "ab" },
      { from: "b", to: "c", label: "bc" },
      { from: "c", to: "a", label: "ca" },
      { from: "b", to: "d", label: "dead-end" },
    ],
    path: ["a", "b", "c"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Same cycle without the spur — should yield identical difficulty. */
  cycleWithoutSpur: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 50, y: 100 },
    ],
    edges: [
      { from: "a", to: "b", label: "ab" },
      { from: "b", to: "c", label: "bc" },
      { from: "c", to: "a", label: "ca" },
    ],
    path: ["a", "b", "c"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Cycle A→B→C→A with TWO dead-end spurs at B: B→D and B→E.
   *  Both should be excluded, yielding same score as cycleWithoutSpur. */
  cycleWithTwoSpurs: {
    controls: [],
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 50, y: 100 },
      { id: "d", x: 200, y: 0 },
      { id: "e_node", x: 200, y: 50 },
    ],
    edges: [
      { from: "a", to: "b", label: "ab" },
      { from: "b", to: "c", label: "bc" },
      { from: "c", to: "a", label: "ca" },
      { from: "b", to: "d", label: "spur1" },
      { from: "b", to: "e_node", label: "spur2" },
    ],
    path: ["a", "b", "c"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,
} as const;

// ─── Edge cases ───────────────────────────────────────────────────────────────

export const edgeCaseContexts = {
  /** Empty graph, no path. */
  emptyPath: {
    controls: [],
    nodes: [],
    edges: [],
    path: [],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,

  /** Single node, no edges. */
  singleNode: {
    controls: [],
    nodes: [{ id: "n1", x: 0, y: 0 }],
    edges: [],
    path: ["n1"],
    mapScale: MAP_SCALE,
  } satisfies RouteContext,
} as const;

