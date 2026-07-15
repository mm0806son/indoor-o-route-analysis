import { describe, it, expect } from "vitest";
import { getRouteLabels, getRouteDescription, getStairSequence } from "./route-labels";
import type { Edge } from "./models/graph";

describe("getRouteLabels", () => {
  const edges: Edge[] = [
    { from: "a", to: "b", label: "" }, // unlabeled corridor
    { from: "b", to: "c", label: "A", reverseLabel: "A down" },
    { from: "c", to: "d", label: "B" },
  ];
  const findEdge = (from: string, to: string) =>
    edges.find((e) => (e.from === from && e.to === to) || (!e.oneWay && e.from === to && e.to === from));

  it("collects labels for traversed edges, skipping unlabeled ones", () => {
    expect(getRouteLabels(["a", "b", "c", "d"], findEdge)).toEqual(["A", "B"]);
  });

  it("uses the reverse label when the edge is traversed backwards", () => {
    expect(getRouteLabels(["d", "c", "b", "a"], findEdge)).toEqual(["B", "A down"]);
  });

  it("falls back to the forward label when traversed backwards with no reverseLabel set", () => {
    expect(getRouteLabels(["d", "c"], findEdge)).toEqual(["B"]);
  });

  it("returns an empty array when no edges exist between consecutive path nodes", () => {
    expect(getRouteLabels(["a", "z"], findEdge)).toEqual([]);
  });
});

describe("getRouteDescription", () => {
  it("joins labels with a comma and space", () => {
    const edges: Edge[] = [
      { from: "a", to: "b", label: "A" },
      { from: "b", to: "c", label: "B" },
    ];
    const findEdge = (from: string, to: string) => edges.find((e) => e.from === from && e.to === to);
    expect(getRouteDescription(["a", "b", "c"], findEdge)).toBe("A, B");
  });
});

describe("getStairSequence", () => {
  it("joins labels with a comma and no space", () => {
    const edges: Edge[] = [
      { from: "a", to: "b", label: "A" },
      { from: "b", to: "c", label: "B" },
    ];
    const findEdge = (from: string, to: string) => edges.find((e) => e.from === from && e.to === to);
    expect(getStairSequence(["a", "b", "c"], findEdge)).toBe("A,B");
  });

  it("produces the same label sequence as getRouteLabels, just joined differently", () => {
    const edges: Edge[] = [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "X", reverseLabel: "X down" },
    ];
    const findEdge = (from: string, to: string) =>
      edges.find((e) => (e.from === from && e.to === to) || (!e.oneWay && e.from === to && e.to === from));
    const path = ["c", "b", "a"];
    expect(getStairSequence(path, findEdge)).toBe(getRouteLabels(path, findEdge).join(","));
  });
});
