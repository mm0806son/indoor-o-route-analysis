import type { HumanRouteFrame, HumanRouteResult } from "@indoor-o-route-analysis/core";
import type { LabsDisplayedRoute } from "../displayed-route";

export function playbackRoute(
  result: HumanRouteResult,
  frame: HumanRouteFrame | undefined,
  labels: { fromLabel?: string; toLabel?: string },
): LabsDisplayedRoute {
  return {
    path: result.route.path,
    distance: result.route.distance,
    ...labels,
    forwardSegmentCount: result.sameFloor ? undefined : result.forwardLabels.length,
    showPath: frame?.kind === "closure" || frame?.kind === "same-floor",
  };
}
