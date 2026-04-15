import { describe, it, expect } from "vitest";
import { findDeadEndEdgeIds, edgeKey } from "./graph-utils";
import type { Edge } from "../models";

describe("findDeadEndEdgeIds", () => {
  it("returns empty set for an empty graph", () => {
    const result = findDeadEndEdgeIds([], []);
    expect(result.size).toBe(0);
  });

  it("detects a single edge as dead-end (both endpoints are degree 1)", () => {
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["a", "b"]);
    expect(result.has(edgeKey("a", "b"))).toBe(true);
  });

  it("detects dead-end branches in a T-shaped graph", () => {
    // Graph: A--B--C with D branching off B
    //        B is a branching node (degree 3)
    //        A, C, D are all leaves (degree 1)
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "" },
      { from: "b", to: "d", label: "" },
    ];
    const nodeIds = ["a", "b", "c", "d"];
    const result = findDeadEndEdgeIds(edges, nodeIds);

    // Each leaf connects directly to branching node B
    expect(result.has(edgeKey("a", "b"))).toBe(true);
    expect(result.has(edgeKey("b", "c"))).toBe(true);
    expect(result.has(edgeKey("b", "d"))).toBe(true);
  });

  it("returns empty set for a cycle (no dead ends)", () => {
    // Triangle: A--B--C--A
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "" },
      { from: "c", to: "a", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["a", "b", "c"]);
    expect(result.size).toBe(0);
  });

  it("detects dead-end spur off a cycle", () => {
    // Triangle A--B--C--A with spur D off B
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "" },
      { from: "c", to: "a", label: "" },
      { from: "b", to: "d", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["a", "b", "c", "d"]);

    // Only D is a leaf, B is branching (degree 3) — only b→d is dead-end
    expect(result.has(edgeKey("b", "d"))).toBe(true);
    expect(result.has(edgeKey("a", "b"))).toBe(false);
    expect(result.has(edgeKey("b", "c"))).toBe(false);
    expect(result.has(edgeKey("c", "a"))).toBe(false);
  });

  it("handles nodes not referenced by any edge", () => {
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
    ];
    // "c" has no edges — degree 0, not a dead end
    const result = findDeadEndEdgeIds(edges, ["a", "b", "c"]);
    expect(result.has(edgeKey("a", "b"))).toBe(true); // a and b are both degree 1
  });

  it("propagates dead-end along an unbranched chain to the branching node", () => {
    // Cycle A--B--C--A with spur B--D--E--F
    // B has degree 3 (branching), D and E have degree 2 (pass-through)
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "" },
      { from: "c", to: "a", label: "" },
      { from: "b", to: "d", label: "" },
      { from: "d", to: "e", label: "" },
      { from: "e", to: "f", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["a", "b", "c", "d", "e", "f"]);

    // F is leaf → walk inward: F→E, E degree 2 → D, D degree 2 → B, B degree 3 → stop
    // Entire spur b→d, d→e, e→f is dead-end
    expect(result.has(edgeKey("b", "d"))).toBe(true);
    expect(result.has(edgeKey("d", "e"))).toBe(true);
    expect(result.has(edgeKey("e", "f"))).toBe(true);
    // Cycle edges are NOT dead-end
    expect(result.has(edgeKey("a", "b"))).toBe(false);
    expect(result.has(edgeKey("b", "c"))).toBe(false);
    expect(result.has(edgeKey("c", "a"))).toBe(false);
  });

  it("stops propagation at branching nodes even if all their branches are dead-ends", () => {
    // Cycle A--B--C--A
    // Hub X off B: B--X, with two spurs X--D and X--E
    // X has degree 3 (branching): B, D, E
    // B has degree 3 (branching): A, C, X
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "" },
      { from: "c", to: "a", label: "" },
      { from: "b", to: "x", label: "" },
      { from: "x", to: "d", label: "" },
      { from: "x", to: "e", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["a", "b", "c", "d", "e", "x"]);

    // D and E are leaves, X is branching (degree 3)
    // Dead-end from D stops at X: x→d dead-end
    // Dead-end from E stops at X: x→e dead-end
    // B--X (b→x) is NOT dead-end — X is a branching node (decision point)
    expect(result.has(edgeKey("x", "d"))).toBe(true);
    expect(result.has(edgeKey("x", "e"))).toBe(true);
    expect(result.has(edgeKey("b", "x"))).toBe(false);
    expect(result.has(edgeKey("a", "b"))).toBe(false);
    expect(result.has(edgeKey("b", "c"))).toBe(false);
    expect(result.has(edgeKey("c", "a"))).toBe(false);
  });

  it("does not propagate through a corridor connecting two branching nodes", () => {
    // Two hubs connected by a corridor, each with leaf spurs:
    //     A           C
    //     |           |
    // B---X---Y---Z---W---D
    //     |           |
    //     E           F
    // X has degree 3 (A, B, Y), W has degree 3 (C, D, Z)
    // Y and Z have degree 2 (pass-through)
    const edges: Edge[] = [
      { from: "a", to: "x", label: "" },
      { from: "b", to: "x", label: "" },
      { from: "e", to: "x", label: "" },
      { from: "x", to: "y", label: "" },
      { from: "y", to: "z", label: "" },
      { from: "z", to: "w", label: "" },
      { from: "w", to: "c", label: "" },
      { from: "w", to: "d", label: "" },
      { from: "w", to: "f", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["a", "b", "c", "d", "e", "f", "x", "y", "z", "w"]);

    // Leaf spurs terminate at branching nodes
    expect(result.has(edgeKey("a", "x"))).toBe(true);
    expect(result.has(edgeKey("b", "x"))).toBe(true);
    expect(result.has(edgeKey("e", "x"))).toBe(true);
    expect(result.has(edgeKey("w", "c"))).toBe(true);
    expect(result.has(edgeKey("w", "d"))).toBe(true);
    expect(result.has(edgeKey("w", "f"))).toBe(true);
    // Corridor X--Y--Z--W is NOT dead-end — connects two branching nodes
    expect(result.has(edgeKey("x", "y"))).toBe(false);
    expect(result.has(edgeKey("y", "z"))).toBe(false);
    expect(result.has(edgeKey("z", "w"))).toBe(false);
  });

  it("handles two spurs off a cycle correctly", () => {
    // Cycle: A--B--C--A
    // Spur 1: A--D--E (A has degree 3)
    // Spur 2: C--F     (C has degree 3)
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "" },
      { from: "c", to: "a", label: "" },
      { from: "a", to: "d", label: "" },
      { from: "d", to: "e", label: "" },
      { from: "c", to: "f", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["a", "b", "c", "d", "e", "f"]);

    // E leaf → walk: E→D, D degree 2 → A, A degree 3 → stop
    // F leaf → walk: F→C, C degree 3 → stop
    expect(result.has(edgeKey("a", "d"))).toBe(true);
    expect(result.has(edgeKey("d", "e"))).toBe(true);
    expect(result.has(edgeKey("c", "f"))).toBe(true);
    // Cycle edges are NOT dead-end
    expect(result.has(edgeKey("a", "b"))).toBe(false);
    expect(result.has(edgeKey("b", "c"))).toBe(false);
    expect(result.has(edgeKey("c", "a"))).toBe(false);
  });

  it("marks all edges as dead-end in a pure linear graph (no cycles)", () => {
    // Linear: A--B--C--D (all degree ≤ 2, no branching nodes)
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "" },
      { from: "c", to: "d", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["a", "b", "c", "d"]);

    expect(result.has(edgeKey("a", "b"))).toBe(true);
    expect(result.has(edgeKey("b", "c"))).toBe(true);
    expect(result.has(edgeKey("c", "d"))).toBe(true);
  });

  it("marks all leaf edges of a tree with a single branching node", () => {
    // Star graph: X in center, A, B, C, D are leaves
    // X has degree 4 (branching node)
    const edges: Edge[] = [
      { from: "x", to: "a", label: "" },
      { from: "x", to: "b", label: "" },
      { from: "x", to: "c", label: "" },
      { from: "x", to: "d", label: "" },
    ];
    const result = findDeadEndEdgeIds(edges, ["x", "a", "b", "c", "d"]);

    // All edges connect a leaf to the branching node
    expect(result.has(edgeKey("x", "a"))).toBe(true);
    expect(result.has(edgeKey("x", "b"))).toBe(true);
    expect(result.has(edgeKey("x", "c"))).toBe(true);
    expect(result.has(edgeKey("x", "d"))).toBe(true);
  });
});
