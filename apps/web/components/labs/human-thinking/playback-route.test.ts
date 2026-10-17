import { describe, expect, it } from "vitest";
import type { HumanRouteFrame, HumanRouteResult } from "@indoor-o-route-analysis/core";
import { playbackRoute } from "./playback-route";

const result = {
  route: { path: ["32", "corridor", "Y", "52"], distance: 177 },
  sameFloor: false, forwardLabels: ["Y"], backwardLabels: [],
} as unknown as HumanRouteResult;
const frame = (kind: HumanRouteFrame["kind"]): HumanRouteFrame => ({
  index: 0, kind, visitedByTracking: [], visitedByBacktracking: [],
});
describe("human playback route visibility", () => {
  it.each(["same-floor-check", "exploration", "meeting-rejected", "no-route"] as const)("keeps leg markers but hides the answer in %s", kind => {
    const route = playbackRoute(result, frame(kind), { fromLabel: "2", toLabel: "3" });
    expect(route.showPath).toBe(false);
    expect(route.path).toBe(result.route.path);
    expect([route.fromLabel, route.toLabel]).toEqual(["2", "3"]);
  });
  it("hides the answer before the first frame exists", () => {
    expect(playbackRoute(result, undefined, {}).showPath).toBe(false);
  });
  it("reveals the answer only on completion and hides it again when seeking backward", () => {
    expect(["same-floor-check", "exploration", "closure", "exploration", "same-floor-check"].map(kind =>
      playbackRoute(result, frame(kind as HumanRouteFrame["kind"]), {}).showPath
    )).toEqual([false, false, true, false, false]);
  });
  it("immediately displays a solved same-floor route without a stair split", () => {
    const route = playbackRoute({ ...result, sameFloor: true }, frame("same-floor"), {});
    expect(route.showPath).toBe(true);
    expect(route.forwardSegmentCount).toBeUndefined();
  });
});
