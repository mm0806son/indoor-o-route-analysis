import { describe, it, expect } from "vitest";
import { buildAdjacencyList, dijkstra, findShortestPath, type WeightedGraph } from "./route-search";
import type { Node, Edge } from "./models/graph";

function makeNode(id: string): Node {
  return { id, x: 0, y: 0 };
}

/** Straight-line edge weight: 1 per hop, ignoring actual coordinates. */
function unitDistance(): number {
  return 1;
}

describe("buildAdjacencyList", () => {
  const nodes = new Map<string, Node>([
    ["a", makeNode("a")],
    ["b", makeNode("b")],
    ["c", makeNode("c")],
  ]);
  const resolveNode = (id: string) => nodes.get(id) ?? null;

  it("adds both directions for a bidirectional edge", () => {
    const edges: Edge[] = [{ from: "a", to: "b", label: "" }];
    const graph = buildAdjacencyList(edges, resolveNode, unitDistance);
    expect(graph.get("a")?.get("b")).toBe(1);
    expect(graph.get("b")?.get("a")).toBe(1);
  });

  it("adds only the forward direction for a one-way edge", () => {
    const edges: Edge[] = [{ from: "a", to: "b", label: "", oneWay: true }];
    const graph = buildAdjacencyList(edges, resolveNode, unitDistance);
    expect(graph.get("a")?.get("b")).toBe(1);
    expect(graph.get("b")?.has("a")).toBe(false);
  });

  it("skips edges with an unresolvable endpoint", () => {
    const edges: Edge[] = [{ from: "a", to: "missing", label: "" }];
    const graph = buildAdjacencyList(edges, resolveNode, unitDistance);
    expect(graph.has("a")).toBe(false);
  });

  it("keeps the minimum weight when parallel edges connect the same pair", () => {
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "a", to: "b", label: "alt" },
    ];
    const graph = buildAdjacencyList(edges, resolveNode, (edge) => (edge.label === "alt" ? 0.5 : 1));
    expect(graph.get("a")?.get("b")).toBe(0.5);
  });
});

describe("dijkstra", () => {
  function chainGraph(): WeightedGraph {
    // a -1- b -1- c -1- d, plus a direct a->d shortcut of weight 5
    return new Map([
      ["a", new Map([["b", 1], ["d", 5]])],
      ["b", new Map([["a", 1], ["c", 1]])],
      ["c", new Map([["b", 1], ["d", 1]])],
      ["d", new Map([["c", 1], ["a", 5]])],
    ]);
  }

  it("finds the shortest path across multiple hops over a longer direct edge", () => {
    const result = dijkstra(chainGraph(), "a", "d");
    expect(result).toEqual({ distance: 3, path: ["a", "b", "c", "d"] });
  });

  it("returns a zero-distance single-node path when start equals end", () => {
    const result = dijkstra(chainGraph(), "a", "a");
    expect(result).toEqual({ distance: 0, path: ["a"] });
  });

  it("returns null when no path exists", () => {
    const graph: WeightedGraph = new Map([
      ["a", new Map([["b", 1]])],
      ["b", new Map([["a", 1]])],
      ["isolated", new Map()],
    ]);
    expect(dijkstra(graph, "a", "isolated")).toBeNull();
  });

  it("tolerates a start or end node missing from the graph", () => {
    const graph: WeightedGraph = new Map([["a", new Map([["b", 1]])], ["b", new Map()]]);
    expect(dijkstra(graph, "a", "nowhere")).toBeNull();
  });

  it("invokes onNodeSettled and onEdgeEvaluated hooks during the search", () => {
    const settled: string[] = [];
    const evaluated: Array<{ from: string; to: string; relaxed: boolean }> = [];
    dijkstra(chainGraph(), "a", "d", {
      onNodeSettled: (nodeId) => settled.push(nodeId),
      onEdgeEvaluated: (from, to, relaxed) => evaluated.push({ from, to, relaxed }),
    });
    expect(settled).toContain("a");
    expect(evaluated.length).toBeGreaterThan(0);
    expect(evaluated.every((e) => typeof e.relaxed === "boolean")).toBe(true);
  });
});

describe("findShortestPath", () => {
  const nodes = new Map<string, Node>([
    ["a", makeNode("a")],
    ["b", makeNode("b")],
    ["c", makeNode("c")],
    ["d", makeNode("d")],
  ]);
  // a-b-c-d chain (weight 1 per hop) plus a longer direct a->d shortcut (weight 5).
  const edges: Edge[] = [
    { from: "a", to: "b", label: "" },
    { from: "b", to: "c", label: "" },
    { from: "c", to: "d", label: "" },
    { from: "a", to: "d", label: "" },
  ];
  const edgeDistanceMeters = (edge: Edge | undefined) => (edge?.from === "a" && edge?.to === "d" ? 5 : 1);

  it("builds the adjacency list and finds the shortest path in one call", () => {
    const result = findShortestPath("a", "d", {
      edges,
      resolveNode: (id) => nodes.get(id) ?? null,
      edgeDistanceMeters,
    });
    expect(result).toEqual({ distance: 3, path: ["a", "b", "c", "d"] });
  });

  it("returns null when no path exists", () => {
    const result = findShortestPath("a", "isolated", {
      edges,
      resolveNode: (id) => nodes.get(id) ?? null,
      edgeDistanceMeters,
    });
    expect(result).toBeNull();
  });

  it("forwards hooks through to the underlying search", () => {
    const settled: string[] = [];
    findShortestPath("a", "d", {
      edges,
      resolveNode: (id) => nodes.get(id) ?? null,
      edgeDistanceMeters,
      hooks: { onNodeSettled: (nodeId) => settled.push(nodeId) },
    });
    expect(settled).toContain("a");
  });
});
