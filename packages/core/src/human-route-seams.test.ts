import { describe, expect, it } from "vitest";
import { traceToExplanation } from "./human-route-explanation";
import { buildHumanRouteExportBundle, humanRouteExportToJson } from "./human-route-export";
import { RouteAnalyzer } from "./route-analyzer";
import { traceToFrames } from "./human-route-frames";
import { analyzeThinkingEffort } from "./human-route-effort";
import { buildHumanRouteOverlay } from "./human-route-overlay";

describe("directed corridor seams through analysis and playback", () => {
  it("keeps seams in the route while counting only the real stair", () => {
    const nodes = ["32", "1212", "1211", "1223", "1082", "52"].map((id, i) => ({ id, x: i * 10, y: 0 }));
    const controls = [
      { id: "32", type: "control" as const, mapPosition: { x: 0, y: 0 } },
      { id: "52", type: "control" as const, mapPosition: { x: 50, y: 0 } },
    ];
    const analyzer = new RouteAnalyzer(controls, nodes, [
      { from: "32", to: "1212", label: "" },
      { from: "1212", to: "1211", label: "", oneWay: true },
      { from: "1211", to: "1223", label: "" },
      { from: "1223", to: "1082", label: "Y" },
      { from: "1082", to: "52", label: "" },
    ], 1000);
    const result = analyzer.findHumanRouteWithTrace("32", "52")!;
    expect(result).toBeDefined();
    expect(result.route.path).toEqual(expect.arrayContaining(nodes.map(n => n.id)));
    expect([...result.forwardLabels, ...result.backwardLabels]).toEqual(["Y"]);
    expect(analyzeThinkingEffort(result).planDepth).toBe(1);
    const frames = traceToFrames(result);
    expect(frames.at(-1)!.planLabels).toEqual(["Y"]);
    expect(buildHumanRouteOverlay(frames.at(-1)!).meetingCluster).toBe(result.meetingAttempts.find(m => m.accepted)!.cluster);
    for (const frame of frames) expect(buildHumanRouteOverlay(frame)).toBeDefined();
    expect(result.explorationTrace[0].candidates[0].path).toEqual(["32", "1212", "1211", "1223"]);
    expect(analyzer.findHumanRouteWithTrace("52", "32")).toBeUndefined();
  });
});

describe("actual choices drive narration and map playback", () => {
  it.each(["tracking", "backtracking"] as const)("records an immediate connection ahead of the nearest %s candidate", (side) => {
    const ids = ["S", "F", "A", "B", "C", "D", "T"];
    const nodes = ids.map((id, i) => ({ id, x: i * 10, y: 0 }));
    const controls = [
      { id: "S", type: "control" as const, mapPosition: { x: 0, y: 0 } },
      { id: "T", type: "control" as const, mapPosition: { x: 60, y: 0 } },
    ];
    const edges = side === "tracking" ? [
      { from: "S", to: "F", label: "f", oneWay: true },
      { from: "S", to: "A", label: "", oneWay: true },
      { from: "A", to: "T", label: "Y", oneWay: true },
    ] : [
      { from: "S", to: "A", label: "X", oneWay: true },
      { from: "A", to: "B", label: "", oneWay: true },
      { from: "B", to: "C", label: "Y", oneWay: true },
      { from: "C", to: "T", label: "", oneWay: true },
      { from: "D", to: "T", label: "f", oneWay: true },
    ];
    const result = new RouteAnalyzer(controls, nodes, edges, 1000).findHumanRouteWithTrace("S", "T")!;
    const frames = traceToFrames(result);
    const decision = frames.find(f => f.completesRoute)!;
    expect(decision.side).toBe(side);
    expect(decision.candidates![0].label).toBe("f");
    expect(decision.candidates![decision.chosenCandidateIndex!].label).toBe("Y");
    const overlay = buildHumanRouteOverlay(decision);
    expect(overlay.candidates.filter(c => c.chosen).map(c => c.label)).toEqual(["Y"]);
    expect(overlay.candidates.find(c => c.chosen)!.path).toEqual(side === "tracking" ? ["S", "A"] : ["C", "T"]);
    const explanation = traceToExplanation(result);
    expect(explanation[decision.index].text).toContain("Stair Y connects");
    expect(explanation[decision.index].text).not.toContain("try f");
    expect(explanation.at(-1)!.text).not.toContain("worked out from the control");
    const closure = frames.at(-1)!;
    expect(closure.memory).toBeUndefined();
    expect(closure.finalPaths).toBeDefined();
    expect(buildHumanRouteOverlay(closure).meetingConnector).toBeDefined();
    expect(closure.planLabels).toEqual(side === "tracking" ? ["Y"] : ["X", "Y"]);
    const exported = JSON.parse(humanRouteExportToJson(buildHumanRouteExportBundle("S", "T", result)));
    expect(exported.result.explorationTrace.find((s: { completesRoute?: boolean }) => s.completesRoute).chosenCandidateIndex).toBe(decision.chosenCandidateIndex);
    expect(exported.explanation).toEqual(explanation);
  });
});
