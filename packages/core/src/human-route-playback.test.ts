import { describe, expect, it } from "vitest";
import { traceToExplanation } from "./human-route-explanation";
import { buildHumanRouteExportBundle, humanRouteExportToJson } from "./human-route-export";
import { RouteAnalyzer } from "./route-analyzer";
import { traceToFrames } from "./human-route-frames";
import { buildHumanRouteOverlay } from "./human-route-overlay";

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
      { from: "S", to: "A", label: "" },
      { from: "A", to: "T", label: "Y", oneWay: true },
    ] : [
      { from: "S", to: "A", label: "X", oneWay: true },
      { from: "A", to: "B", label: "" },
      { from: "B", to: "C", label: "Y", oneWay: true },
      { from: "C", to: "T", label: "" },
      { from: "D", to: "T", label: "f", oneWay: true },
    ];
    const result = new RouteAnalyzer(controls, nodes, edges, 1000).findHumanRouteWithTrace("S", "T")!;
    const frames = traceToFrames(result);
    const decision = frames.find(f => f.completesRoute)!;
    expect(decision).toBeDefined();
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
