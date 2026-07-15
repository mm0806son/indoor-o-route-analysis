import { describe, it, expect } from "vitest";
import {
  buildHumanRouteExportBundle,
  humanRouteExportToJson,
  humanRouteExportFromJson,
  humanRouteExportToMarkdown,
} from "./human-route-export";
import type { HumanRouteResult, RouteInfo } from "./route-analyzer";

function stubRoute(distance: number, path: string[], labels: string[]): RouteInfo {
  return {
    distance,
    path,
    pathPolygons: [],
    decisionPoints: 0,
    decisionPointNodeIds: [],
    branchingPointNodeIds: [],
    alternativeEdges: 0,
    oneWayEdges: 0,
    ignoreLengthEdges: 0,
    description: labels.join(""),
    labels,
    difficulty: 0,
  };
}

const multiFloorResult: HumanRouteResult = {
  route: stubRoute(100, ["S", "A", "B", "C", "D", "T"], ["1", "2"]),
  sameFloor: false,
  forwardLabels: ["1"],
  backwardLabels: ["2"],
  explorationTrace: [
    { order: 0, side: "tracking", cluster: "F1", candidates: [{ label: "1", toCluster: "F2", distanceMeters: 5 }] },
    { order: 1, side: "backtracking", cluster: "F3", candidates: [{ label: "2", toCluster: "F2", distanceMeters: 5 }] },
  ],
  meetingAttempts: [{ order: 2, cluster: "F2", accepted: true }],
};

describe("human route export", () => {
  it("round-trips through JSON unchanged", () => {
    const bundle = buildHumanRouteExportBundle("31", "32", multiFloorResult, 50);
    const json = humanRouteExportToJson(bundle);
    const parsed = humanRouteExportFromJson(json);
    expect(parsed).toEqual(bundle);
  });

  it("produces a Markdown transcript with the leg, plan, and effort summary", () => {
    const bundle = buildHumanRouteExportBundle("31", "32", multiFloorResult, 50);
    const markdown = humanRouteExportToMarkdown(bundle);
    expect(markdown).toContain("31");
    expect(markdown).toContain("32");
    expect(markdown).toContain("1, 2");
    expect(markdown).toContain("Mental steps");
    expect(markdown).toContain("Plan depth");
  });

  it("uses course-relative labels in Markdown when provided, instead of raw control ids", () => {
    const bundle = buildHumanRouteExportBundle("31", "32", multiFloorResult, 50, { fromLabel: "3", toLabel: "4" });
    expect(bundle.leg).toEqual({ fromControlId: "31", toControlId: "32", fromLabel: "3", toLabel: "4" });
    const markdown = humanRouteExportToMarkdown(bundle);
    expect(markdown).toContain("# Human route: 3 → 4");
  });

  it("falls back to the raw control id when no label is provided", () => {
    const bundle = buildHumanRouteExportBundle("31", "32", multiFloorResult, 50);
    expect(bundle.leg.fromLabel).toBe("31");
    expect(bundle.leg.toLabel).toBe("32");
  });

  it("notes a same-floor solve distinctly in Markdown", () => {
    const sameFloorResult: HumanRouteResult = {
      route: stubRoute(50, ["S", "T"], []),
      sameFloor: true,
      forwardLabels: [],
      backwardLabels: [],
      explorationTrace: [],
      meetingAttempts: [],
    };
    const bundle = buildHumanRouteExportBundle("31", "32", sameFloorResult);
    const markdown = humanRouteExportToMarkdown(bundle);
    expect(markdown.toLowerCase()).toContain("same floor");
  });
});
