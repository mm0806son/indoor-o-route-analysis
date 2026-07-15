import { describe, it, expect } from "vitest";
import { getCoordinates, straightLineDistanceMeters, computeConvexHull } from "./geometry";
import type { Node } from "../models/graph";
import type { Control } from "../models/control";

describe("getCoordinates", () => {
  it("reads x/y directly from a Node", () => {
    const node: Node = { id: "n1", x: 12, y: 34 };
    expect(getCoordinates(node)).toEqual({ x: 12, y: 34 });
  });

  it("reads mapPosition from a Control", () => {
    const control: Control = { id: "31", type: "control", mapPosition: { x: 5, y: 6 } };
    expect(getCoordinates(control)).toEqual({ x: 5, y: 6 });
  });
});

describe("straightLineDistanceMeters", () => {
  it("computes Euclidean distance in mm scaled to meters", () => {
    // 3-4-5 triangle: 30mm x 40mm -> 50mm, at 1:1000 scale -> 50m
    const distance = straightLineDistanceMeters({ x: 0, y: 0 }, { x: 30, y: 40 }, 1000);
    expect(distance).toBeCloseTo(50);
  });

  it("is symmetric", () => {
    const a = { x: 10, y: 20 };
    const b = { x: 100, y: 5 };
    expect(straightLineDistanceMeters(a, b, 500)).toBeCloseTo(straightLineDistanceMeters(b, a, 500));
  });

  it("returns zero for coincident points", () => {
    const p = { x: 42, y: 7 };
    expect(straightLineDistanceMeters(p, p, 1000)).toBe(0);
  });
});

describe("computeConvexHull", () => {
  it("returns the input as-is for fewer than 3 distinct points", () => {
    expect(computeConvexHull([])).toEqual([]);
    expect(computeConvexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
    expect(computeConvexHull([{ x: 1, y: 1 }, { x: 5, y: 5 }])).toHaveLength(2);
  });

  it("drops interior points, keeping only the square's four corners", () => {
    const points = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior, should be excluded
    ];
    const hull = computeConvexHull(points);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });

  it("deduplicates coincident points", () => {
    const points = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      { x: 0, y: 0 }, // duplicate
    ];
    expect(computeConvexHull(points)).toHaveLength(4);
  });

  it("handles all-collinear points as a degenerate (non-area) hull", () => {
    const hull = computeConvexHull([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
    expect(hull.every((p) => p.y === 0)).toBe(true);
  });

  it("is deterministic across repeated calls", () => {
    const points = [{ x: 3, y: 1 }, { x: 0, y: 0 }, { x: 4, y: 4 }, { x: 1, y: 5 }, { x: 2, y: 2 }];
    expect(computeConvexHull(points)).toEqual(computeConvexHull(points));
  });
});
