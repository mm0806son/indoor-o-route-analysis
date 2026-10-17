import { describe, expect, it } from "vitest";
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
