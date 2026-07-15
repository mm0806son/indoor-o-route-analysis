import { describe, expect, it } from "vitest";
import type { Control } from "./models/control";
import type { Edge, Node } from "./models/graph";
import { RouteAnalyzer } from "./route-analyzer";
import { TraceRecorder } from "./route-analyzer-trace";

// Same small branching fixture used by route-analyzer.test.ts: two stair
// options (stairs1 direct, alt1+stairs2 via a detour) between level 1 and
// level 2, so both dijkstra() and findAllAlternativePathsBetweenControls()
// have real search work and more than one route to find.
const controls: Control[] = [
  { id: "c1", type: "start", mapPosition: { x: 0, y: 0 } },
  { id: "c2", type: "control", mapPosition: { x: 100, y: 0 } },
  { id: "c3", type: "control", mapPosition: { x: 200, y: 0 } },
  { id: "c4", type: "finish", mapPosition: { x: 300, y: 0 } },
];

const nodes: Node[] = [
  { id: "n1", x: 50, y: 0 },
  { id: "n2", x: 150, y: 0 },
  { id: "n3", x: 150, y: 50 },
  { id: "n4", x: 250, y: 0 },
];

const edges: Edge[] = [
  { from: "c1", to: "n1", label: "corridor1", oneWay: false },
  { from: "n1", to: "c2", label: "corridor2", oneWay: false },
  { from: "c2", to: "n2", label: "corridor3", oneWay: false },
  { from: "n2", to: "c3", label: "stairs1", ignoreLength: true },
  { from: "c3", to: "n4", label: "corridor4", oneWay: true },
  { from: "n4", to: "c4", label: "corridor5", oneWay: false },
  { from: "n2", to: "n3", label: "alt1", oneWay: false },
  { from: "n3", to: "c3", label: "stairs2", ignoreLength: true },
];

const mapScale = 5000;

describe("TraceRecorder", () => {
  it("records node-settled and edge-evaluated events during dijkstra()", () => {
    const recorder = new TraceRecorder();
    const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, [], recorder);

    const result = analyzer.dijkstra("c1", "c4");
    expect(result).not.toBeNull();

    const nodeSettled = recorder.events.filter((e) => e.kind === "node-settled");
    const edgeEvaluated = recorder.events.filter((e) => e.kind === "edge-evaluated");
    expect(nodeSettled.length).toBeGreaterThan(0);
    expect(edgeEvaluated.length).toBeGreaterThan(0);
    expect(nodeSettled.every((e) => e.algorithm === "dijkstra")).toBe(true);

    // seq numbers are monotonically increasing
    const seqs = recorder.events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it("does not change dijkstra's own return value when a visualizer is attached", () => {
    const plain = new RouteAnalyzer(controls, nodes, edges, mapScale);
    const withRecorder = new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, [], new TraceRecorder());

    expect(withRecorder.dijkstra("c1", "c4")).toEqual(plain.dijkstra("c1", "c4"));
  });

  it("records route-found events matching findAllAlternativePathsBetweenControls's return value", () => {
    const recorder = new TraceRecorder();
    const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, [], recorder);

    const routes = analyzer.findAllAlternativePathsBetweenControls("c1", "c4", 10);
    expect(routes.length).toBeGreaterThanOrEqual(2); // stairs1 direct + alt1/stairs2 detour

    const routeFound = recorder.events.filter((e) => e.kind === "route-found");
    expect(routeFound).toHaveLength(routes.length);
    expect(recorder.routes).toEqual(routes);

    // Every returned route is reachable by reference from a route-found event
    // (proves the recorder observes the exact objects returned to the caller).
    for (const route of routes) {
      expect(routeFound.some((e) => e.route === route)).toBe(true);
    }
  });

  it("does not change findAllAlternativePathsBetweenControls's return value when a visualizer is attached", () => {
    const plain = new RouteAnalyzer(controls, nodes, edges, mapScale);
    const withRecorder = new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, [], new TraceRecorder());

    const plainRoutes = plain.findAllAlternativePathsBetweenControls("c1", "c4", 10);
    const recordedRoutes = withRecorder.findAllAlternativePathsBetweenControls("c1", "c4", 10);
    expect(recordedRoutes).toEqual(plainRoutes);
  });

  it("works identically with no visualizer attached (backward compatibility)", () => {
    const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
    expect(() => analyzer.dijkstra("c1", "c4")).not.toThrow();
    expect(() => analyzer.findAllAlternativePathsBetweenControls("c1", "c4", 10)).not.toThrow();
  });

  it("caps low-level events at maxLowLevelEvents but never caps route-found events", () => {
    const recorder = new TraceRecorder({ maxLowLevelEvents: 1 });
    const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, [], recorder);

    const routes = analyzer.findAllAlternativePathsBetweenControls("c1", "c4", 10);
    const lowLevel = recorder.events.filter((e) => e.kind === "node-settled" || e.kind === "edge-evaluated");
    const routeFound = recorder.events.filter((e) => e.kind === "route-found");

    expect(lowLevel.length).toBeLessThanOrEqual(1);
    expect(routeFound).toHaveLength(routes.length);
    expect(recorder.isTruncated).toBe(true);
  });

  it("records events during findHumanRouteBetweenControls's tracking/backtracking search", () => {
    const recorder = new TraceRecorder();
    const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, [], recorder);

    const route = analyzer.findHumanRouteBetweenControls("c1", "c4");
    expect(route).toBeDefined();

    const nodeSettled = recorder.events.filter((e) => e.kind === "node-settled");
    const edgeEvaluated = recorder.events.filter((e) => e.kind === "edge-evaluated");
    const routeFound = recorder.events.filter((e) => e.kind === "route-found");

    expect(nodeSettled.length).toBeGreaterThan(0);
    expect(edgeEvaluated.length).toBeGreaterThan(0);
    expect(nodeSettled.every((e) => e.algorithm === "human-route")).toBe(true);
    expect(edgeEvaluated.every((e) => e.algorithm === "human-route")).toBe(true);
    expect(routeFound).toHaveLength(1);
    expect(routeFound[0].route).toEqual(route);
  });

  it("does not change findHumanRouteBetweenControls's return value when a visualizer is attached", () => {
    const plain = new RouteAnalyzer(controls, nodes, edges, mapScale);
    const withRecorder = new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, [], new TraceRecorder());

    expect(withRecorder.findHumanRouteBetweenControls("c1", "c4")).toEqual(plain.findHumanRouteBetweenControls("c1", "c4"));
  });
});
