import { describe, it, expect } from "vitest";
import { buildHumanRouteLabelResolver } from "./human-route-labels";
import type { Node } from "./models/graph";
import type { Polygon } from "./models/polygon";

function node(id: string, x: number, y: number): Node {
  return { id, x, y };
}

function square(id: string, level: number, x0: number, y0: number, size: number): Polygon {
  return {
    id,
    level,
    points: [
      { x: x0, y: y0 },
      { x: x0 + size, y: y0 },
      { x: x0 + size, y: y0 + size },
      { x: x0, y: y0 + size },
    ],
  };
}

describe("buildHumanRouteLabelResolver", () => {
  // Two floors: F1 = {S, A} around (0,0), F2 = {B, T} around (0,100).
  const nodes = [node("S", 5, 5), node("A", 8, 5), node("B", 5, 105), node("T", 8, 105)];
  const polygons: Polygon[] = [square("floor1", 1, 0, 0, 10), square("floor2", 2, 0, 100, 10)];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const makeResolver = () => buildHumanRouteLabelResolver({
    clusterOf: { S: "S", A: "S", B: "B", T: "B" },
    fromNodeId: "S",
    fromLabel: "S",
    toNodeId: "T",
    toLabel: "3",
    resolveNode: (id) => byId.get(id) ?? null,
    getCoordinates: (item) => ({ x: (item as Node).x, y: (item as Node).y }),
    polygons,
  });

  it("resolves the control number for the start node and its cluster", () => {
    const resolver = makeResolver();
    expect(resolver.controlNumberOf("S")).toBe("S");
    expect(resolver.controlNumberOf("S")).toBe("S"); // cluster id happens to equal the node id here
  });

  it("resolves the control number for the target node and its cluster", () => {
    const resolver = makeResolver();
    expect(resolver.controlNumberOf("T")).toBe("3");
    expect(resolver.controlNumberOf("B")).toBe("3"); // T's cluster representative
  });

  it("returns undefined for a cluster that isn't the leg's start or end", () => {
    const resolver = makeResolver();
    expect(resolver.controlNumberOf("somewhere-else")).toBeUndefined();
  });

  it("resolves a floor label from the polygon containing the node", () => {
    const resolver = makeResolver();
    expect(resolver.floorLabelOf("S")).toBe("floor 1");
    expect(resolver.floorLabelOf("B")).toBe("floor 2");
  });

  it("returns undefined when no polygon contains the node", () => {
    const resolver = buildHumanRouteLabelResolver({
      clusterOf: {},
      fromNodeId: "S",
      fromLabel: "S",
      toNodeId: "T",
      toLabel: "3",
      resolveNode: (id) => byId.get(id) ?? null,
      getCoordinates: (item) => ({ x: (item as Node).x, y: (item as Node).y }),
      polygons: [],
    });
    expect(resolver.floorLabelOf("S")).toBeUndefined();
  });

  it("returns undefined when the id doesn't resolve to a node at all", () => {
    const resolver = makeResolver();
    expect(resolver.floorLabelOf("nonexistent")).toBeUndefined();
  });
});
