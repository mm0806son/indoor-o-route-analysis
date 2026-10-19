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
    .findAlternativePathsBetweenControls("start", "finish", 6)
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
    expect(result.candidateMetrics[i].difficulty).toBe(
      graph.calculatePathDifficulty(candidate.path.map((p) => p.nodeId)),
    );
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
  expect(result.previewMetrics.estimatedTime).toBe(4);
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

it("scores normalized candidates identically to the same personal route (no duplicated control inflation)", async () => {
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
it("matches the real Wangfujing MW21E first-leg screenshot: 93 m, D37, 18.54 s", async () => {
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
  expect(result.candidateMetrics[0].distance).toBeCloseTo(92.70037511904029);
  expect(result.candidateMetrics[0].difficulty).toBeCloseTo(37.03703703703704);
  expect(result.candidateMetrics[0].estimatedTime).toBeCloseTo(
    18.540075023808058,
  );
  result.candidates.forEach((leg, i) => {
    expect(result.candidateMetrics[i].difficulty).toBe(
      measurePublishedLeg(real, leg, result.candidateMetrics[0].distance)
        .difficulty,
    );
  });
});
