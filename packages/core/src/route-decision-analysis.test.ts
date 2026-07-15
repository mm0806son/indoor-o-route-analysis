import { describe, it, expect } from "vitest";
import { analyzeRoute, type AnalyzeRouteContext } from "./route-decision-analysis";
import { RouteAnalyzer } from "./route-analyzer";
import type { Control } from "./models/control";
import type { Node, Edge } from "./models/graph";
import { findDeadEndEdgeIds } from "./utils/graph-utils";

// Same fixture as route-analyzer.test.ts: n2 has a genuine (non-dead-end)
// alternative route to c3 via n3 (n2->c3 direct, or n2->n3->c3) — a real
// loop, not a leaf branch, so it isn't excluded as a dead-end.
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

function makeContext(path: string[]): AnalyzeRouteContext {
  const allIds = [...controls.map((c) => c.id), ...nodes.map((n) => n.id)];
  const nodeEdges = new Map<string, Edge[]>();
  for (const id of allIds) {
    nodeEdges.set(id, edges.filter((e) => e.from === id || e.to === id));
  }
  const findEdge = (from: string, to: string) =>
    edges.find((e) => (e.from === from && e.to === to) || (!e.oneWay && e.from === to && e.to === from));
  const deadEndEdgeIds = findDeadEndEdgeIds(edges, allIds);
  return { controls, nodes, edges, path, mapScale, nodeEdges, findEdge, deadEndEdgeIds };
}

describe("analyzeRoute", () => {
  it("matches RouteAnalyzer.analyzeRoute's output exactly for the same path (extraction is byte-identical)", () => {
    const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
    const path = ["c2", "n2", "c3", "n4"];

    const viaClass = analyzer.analyzeRoute(path);
    const viaStandalone = analyzeRoute(makeContext(path));

    expect(viaStandalone).toEqual(viaClass);
  });

  it("counts n2's genuine alternative (via n3) as an alternative edge, not a dead-end", () => {
    const result = analyzeRoute(makeContext(["c2", "n2", "c3"]));
    // n2's outgoing options are c3 (path, direct stairs1) and n3 (alt1, a real loop back to c3) -> 1 alternative.
    expect(result.alternativeEdges).toBeGreaterThanOrEqual(1);
  });

  it("returns zero alternativeEdges and no branching points for a path with no branching", () => {
    const result = analyzeRoute(makeContext(["c1", "n1", "c2"]));
    expect(result.alternativeEdges).toBe(0);
    expect(result.branchingPointNodeIds).toEqual([]);
  });
});
