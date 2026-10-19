import { RouteAnalyzer } from "@indoor-o-route-analysis/core";
import { expect, it } from "vitest";
import { buildLeg, makeDraft } from "./published-route";

const analyzer = new RouteAnalyzer(
  [],
  [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 },
    { id: "c", x: 20, y: 0 },
  ],
  [
    { from: "a", to: "b", label: "", oneWay: true },
    { from: "b", to: "c", label: "" },
  ],
  1000,
);
it("builds only legal directed paths through selected waypoints", () => {
  expect(buildLeg(analyzer, "a", "c", ["b"]).path.map((n) => n.nodeId)).toEqual(
    ["a", "b", "c"],
  );
  expect(() => buildLeg(analyzer, "c", "a", [])).toThrow();
});
it("new routes retain empty legs so incomplete exports can be rejected", () => {
  const draft = makeDraft(
    {
      id: "course",
      name: "C",
      mapId: "m",
      controls: [{ controlId: "a" }, { controlId: "c" }],
    },
    "id",
  );
  expect(draft.legs[0].path).toEqual([]);
});

it("offers bounded distinct alternatives without reversing a one-way edge", async () => {
  const { exploreLegs } = await import("./published-route");
  const choices = exploreLegs(analyzer, "a", "c");
  expect(choices).toHaveLength(1);
  expect(choices[0].path.map((n) => n.nodeId)).toEqual(["a", "b", "c"]);
  expect(exploreLegs(analyzer, "c", "a")).toEqual([]);
});

it("uses the original Analysis algorithm and returns at most six distinct legal candidates with matching metrics", async () => {
  const { analyzePublishedLeg } = await import("./published-route");
  const controls = [
    { id: "start", type: "start" as const, mapPosition: { x: 0, y: 0 } },
    { id: "finish", type: "finish" as const, mapPosition: { x: 100, y: 0 } },
  ];
  const nodes = Array.from({ length: 8 }, (_, i) => ({
    id: `n${i}`,
    x: 50,
    y: i * 20,
  }));
  const graph = new RouteAnalyzer(
    controls,
    nodes,
    nodes.flatMap((n) => [
      { from: "start", to: n.id, label: "", oneWay: true },
      { from: n.id, to: "finish", label: "", oneWay: true },
    ]),
    1000,
  );
  const expected = graph
    .findRecommendedPathsBetweenControls("start", "finish", 6)
    .slice(0, 6);
  const result = analyzePublishedLeg(graph, "start", "finish", [], 5);
  expect(result.candidates).toHaveLength(6);
  expect(
    new Set(result.candidates.map((c) => JSON.stringify(c.path))).size,
  ).toBe(6);
  result.candidates.forEach((candidate, i) => {
    expect(candidate.path.map((p) => p.nodeId)).toEqual(
      expected[i].path.filter((id, j, path) => !j || id !== path[j - 1]),
    );
    expect(result.candidateMetrics[i].distance).toBe(expected[i].distance);
    expect(result.candidateMetrics[i].difficulty).toBe(expected[i].difficulty);
    expect(result.candidateMetrics[i].estimatedTime).toBe(
      expected[i].distance / 5,
    );
    expect(result.candidateMetrics[i].distanceDelta).toBe(
      expected[i].distance - expected[0].distance,
    );
    expect(result.candidateMetrics[i].timeDelta).toBe(
      (expected[i].distance - expected[0].distance) / 5,
    );
  });
  expect(result.previewMetrics).toEqual(result.candidateMetrics[0]);
});
it("retains automatic alternatives while exploring a waypoint route", async () => {
  const { analyzePublishedLeg } = await import("./published-route");
  const result = analyzePublishedLeg(analyzer, "a", "c", ["b"]);
  expect(result.candidates).toHaveLength(1);
  expect(result.previewMetrics.distance).toBe(20);
  expect(result.previewMetrics.estimatedTime).toBe(20 / 3);
});
it("measures personal routes using the same graph distance and scoring model and validates speed", async () => {
  const { measurePublishedLeg } = await import("./published-route");
  const leg = buildLeg(analyzer, "a", "c", []);
  expect(measurePublishedLeg(analyzer, leg, 10, 5)).toMatchObject({
    distance: 20,
    distanceDelta: 10,
    distanceRatio: 2,
    estimatedTime: 4,
    timeDelta: 2,
    difficulty: analyzer.calculatePathDifficulty(["a", "b", "c"]),
  });
  expect(() => measurePublishedLeg(analyzer, leg, 10, 0)).toThrow();
});

it("scores personal and candidate paths using the same release Analysis convention", async () => {
  const { analyzePublishedLeg, measurePublishedLeg } = await import(
    "./published-route"
  );
  const result = analyzePublishedLeg(analyzer, "a", "c");
  result.candidates.forEach((leg, i) => {
    expect(result.candidateMetrics[i].difficulty).toBe(
      measurePublishedLeg(analyzer, leg, result.candidateMetrics[0].distance)
        .difficulty,
    );
  });
});
it("matches the real Wangfujing release recommendation ordering and metrics", async () => {
  const { readFileSync } = await import("node:fs");
  const graph = JSON.parse(
    readFileSync(
      "../../packages/core/src/__fixtures__/wangfujing-stairs.json",
      "utf8",
    ),
  );
  const delta = JSON.parse(
    readFileSync("lib/__fixtures__/wangfujing-analysis-delta.json", "utf8"),
  );
  const vertices = new Map(
    graph.vertices.map((n: { id: string }) => [n.id, n]),
  );
  for (const node of delta.vertices) vertices.set(node.id, node);
  const edges = new Map(
    graph.edges.map((e: { from: string; to: string }) => [
      JSON.stringify([e.from, e.to]),
      e,
    ]),
  );
  for (const edge of delta.edges)
    edges.set(JSON.stringify([edge.from, edge.to]), edge);
  for (const edge of delta.removedEdges ?? [])
    edges.delete(JSON.stringify([edge.from, edge.to]));
  const real = new RouteAnalyzer(
    delta.controls,
    [...vertices.values()] as import("@indoor-o-route-analysis/core").Node[],
    [...edges.values()] as import("@indoor-o-route-analysis/core").Edge[],
    delta.mapScale,
    undefined,
    graph.polygons,
  );
  const { analyzePublishedLeg, measurePublishedLeg } = await import(
    "./published-route"
  );
  const result = analyzePublishedLeg(real, "S1", "59");
  expect(result.candidates).toHaveLength(6);
  expect(result.candidateMetrics[0].distance).toBeCloseTo(107.19460403321258);
  expect(result.bestDistance).toBeCloseTo(92.70037511904029);
  expect(result.candidateMetrics[0].reasons).toContain("simple");
  expect(result.candidateMetrics[0].difficulty).toBeCloseTo(40.74074074074074);
  expect(result.candidateMetrics[0].estimatedTime).toBeCloseTo(
    107.19460403321258 / 3,
  );
  result.candidates.forEach((leg, i) => {
    expect(result.candidateMetrics[i].difficulty).toBe(
      measurePublishedLeg(real, leg, result.candidateMetrics[0].distance)
        .difficulty,
    );
  });
});

it("matches release 0.2.5-test.2 MW21E 3→4 screenshot and expands genuine nearby variants", async () => {
  const { readFileSync } = await import("node:fs");
  const base = JSON.parse(
    readFileSync(
      "../../packages/core/src/__fixtures__/wangfujing-stairs.json",
      "utf8",
    ),
  );
  const delta = JSON.parse(
    readFileSync("lib/__fixtures__/wangfujing-analysis-delta.json", "utf8"),
  );
  const vertices = new Map(base.vertices.map((n: { id: string }) => [n.id, n]));
  for (const n of delta.vertices) vertices.set(n.id, n);
  const edges = new Map(
    base.edges.map((e: { from: string; to: string }) => [
      JSON.stringify([e.from, e.to]),
      e,
    ]),
  );
  for (const e of delta.edges) edges.set(JSON.stringify([e.from, e.to]), e);
  for (const edge of delta.removedEdges ?? [])
    edges.delete(JSON.stringify([edge.from, edge.to]));
  const real = new RouteAnalyzer(
    delta.controls,
    [...vertices.values()] as import("@indoor-o-route-analysis/core").Node[],
    [...edges.values()] as import("@indoor-o-route-analysis/core").Edge[],
    delta.mapScale,
    undefined,
    base.polygons,
  );
  const { analyzePublishedLeg, previousShortestPathsForLeg } = await import(
    "./published-route"
  );
  const course = {
    controls: ["S1", "59", "32", "52", "56"].map((controlId) => ({
      controlId,
    })),
  };
  const previousShortestPaths = previousShortestPathsForLeg(real, course, 3);
  const result = analyzePublishedLeg(real, "52", "56", [], 3, {
    previousShortestPaths,
  });
  expect(result.bestDistance).toBeCloseTo(289.41991643678995);
  expect(result.candidateMetrics.map((m) => m.reasons?.[0])).toEqual([
    "simple",
    "fewest floors",
    "shortest",
    undefined,
    undefined,
    undefined,
  ]);
  expect(result.candidateMetrics[2]).toMatchObject({
    description: "b2, S, S, S, S, b",
    branchingPoints: 26,
    decisionPoints: 21,
    stairs: 6,
    repetitionRatio: 0,
    totalClimb: 12,
  });
  expect(result.candidateMetrics[2].difficulty).toBeCloseTo(133.33333333333331);
  expect(result.candidateMetrics[2].estimatedTime).toBeCloseTo(
    289.41991643678995 / 3,
  );
  expect(result.candidateMetrics[0].distanceDelta).toBeCloseTo(
    386.09736762023147 - 289.41991643678995,
  );
  expect(Math.round(result.candidateMetrics[1].repetitionRatio! * 100)).toBe(
    40,
  );
  const compact = analyzePublishedLeg(real, "59", "32");
  const expanded = analyzePublishedLeg(real, "59", "32", [], 5, {
    includeVariants: true,
  });
  expect(expanded.candidates.length).toBeGreaterThan(compact.candidates.length);
  expect(
    new Set(expanded.candidates.map((c) => JSON.stringify(c.path))).size,
  ).toBe(expanded.candidates.length);
});
