/**
 * Converts a HumanRouteResult's exploration trace into an ordered sequence
 * of render frames for step-by-step playback (Labs "Human thinking" view).
 * Pure and deterministic: no rendering, no positions, just which clusters
 * were visited by which side and when the plan closed.
 */

import type { HumanRouteResult, HumanRouteSide, HumanRouteCandidate, HumanRouteMemorySnapshot } from "./route-analyzer";

export type HumanRouteFrameKind = "same-floor" | "same-floor-check" | "exploration" | "meeting-rejected" | "closure" | "no-route";

export interface HumanRouteFrame {
  index: number;
  kind: HumanRouteFrameKind;
  /** Which side this frame's step belongs to (exploration / meeting-rejected only). */
  side?: HumanRouteSide;
  /** The cluster this frame's step concerns (expanded-from cluster, or the meeting cluster). Also the "from" side for same-floor-check. */
  cluster?: string;
  /** The "to" side for a same-floor-check frame — paired with `cluster` as the "from" side. */
  toCluster?: string;
  /** Candidate stairs considered from `cluster`, in preference order (exploration only). */
  candidates?: HumanRouteCandidate[];
  chosenCandidateIndex?: number;
  completesRoute?: boolean;
  /** Final drawing paths are separate from exploration working memory. */
  finalPaths?: { forwardPath: string[]; backwardPath: string[] };
  /** What the human must hold in short-term memory at this step (exploration only). */
  memory?: HumanRouteMemorySnapshot;
  /** The specific node the human is standing at for this step - the "origin" marker on the map (exploration only). */
  atNode?: string;
  /** Clusters visited by the tracking side so far, cumulative through this frame. */
  visitedByTracking: string[];
  /** Clusters visited by the backtracking side so far, cumulative through this frame. */
  visitedByBacktracking: string[];
  /** Why a meeting was rejected (meeting-rejected only). */
  rejectedReason?: "stair-reuse" | "stitch-failed";
  /** The full assembled label sequence — set only on the final frame (same-floor / closure). */
  planLabels?: string[];
}

/**
 * Builds the frame sequence for a completed human-route search. Returns a
 * single "no-route" frame if no route was found (the caller should check
 * `HumanRouteResult` itself for that; this helper exists for completeness
 * when a caller only has a null/undefined result to report).
 */
export function traceToFrames(result: HumanRouteResult): HumanRouteFrame[] {
  const frames: HumanRouteFrame[] = [];
  const trackingVisited = new Set<string>();
  const backtrackingVisited = new Set<string>();

  const snapshot = () => ({
    visitedByTracking: Array.from(trackingVisited),
    visitedByBacktracking: Array.from(backtrackingVisited),
  });

  if (result.sameFloor) {
    frames.push({
      index: 0,
      kind: "same-floor",
      ...snapshot(),
      planLabels: [],
    });
    return frames;
  }

  // The search always tries a direct same-floor path first (see
  // findHumanRoute's findUnlabeled call) before falling back to the stair
  // search below; note that failure here, so the player understands why
  // the search moved on to stairs. Uses the cluster ids (like every other
  // frame's `cluster` field) rather than the raw start/end node ids, since
  // `clusterOf` is always populated once we're past the same-floor
  // short-circuit and label resolution expects a resolvable node/cluster id.
  const fromNodeId = result.route.path[0];
  const toNodeId = result.route.path[result.route.path.length - 1];
  frames.push({
    index: 0,
    kind: "same-floor-check",
    cluster: result.clusterOf?.[fromNodeId] ?? fromNodeId,
    toCluster: result.clusterOf?.[toNodeId] ?? toNodeId,
    ...snapshot(),
  });

  type MergedItem =
    | { order: number; type: "step"; side: HumanRouteSide; cluster: string; candidates: HumanRouteCandidate[]; chosenCandidateIndex?: number; completesRoute?: boolean; memory?: HumanRouteMemorySnapshot; atNode?: string }
    | { order: number; type: "meeting"; cluster: string; accepted: boolean; reason?: "stair-reuse" | "stitch-failed" };

  const merged: MergedItem[] = [
    ...result.explorationTrace.map((s) => ({ order: s.order, type: "step" as const, side: s.side, cluster: s.cluster, candidates: s.candidates, chosenCandidateIndex: s.chosenCandidateIndex, completesRoute: s.completesRoute, memory: s.memory, atNode: s.atNode })),
    ...result.meetingAttempts.map((m) => ({ order: m.order, type: "meeting" as const, cluster: m.cluster, accepted: m.accepted, reason: m.reason })),
  ].sort((a, b) => a.order - b.order);

  // Seed the visited sets with each side's starting cluster: the first
  // tracking step's cluster is the start's own cluster, the first
  // backtracking step's cluster is the target's own cluster.
  const firstTracking = merged.find((m) => m.type === "step" && m.side === "tracking");
  const firstBacktracking = merged.find((m) => m.type === "step" && m.side === "backtracking");
  if (firstTracking?.type === "step") trackingVisited.add(firstTracking.cluster);
  if (firstBacktracking?.type === "step") backtrackingVisited.add(firstBacktracking.cluster);

  for (const item of merged) {
    if (item.type === "step") {
      const visited = item.side === "tracking" ? trackingVisited : backtrackingVisited;
      visited.add(item.cluster);
      for (const candidate of item.candidates) visited.add(candidate.toCluster);

      frames.push({
        index: frames.length,
        kind: "exploration",
        side: item.side,
        cluster: item.cluster,
        candidates: item.candidates,
        chosenCandidateIndex: item.chosenCandidateIndex,
        completesRoute: item.completesRoute,
        memory: item.memory,
        atNode: item.atNode,
        ...snapshot(),
      });
    } else if (!item.accepted) {
      frames.push({
        index: frames.length,
        kind: "meeting-rejected",
        cluster: item.cluster,
        rejectedReason: item.reason,
        ...snapshot(),
      });
    }
  }

  const acceptedMeeting = result.meetingAttempts.find((m) => m.accepted);
  frames.push({
    index: frames.length,
    kind: "closure",
    cluster: acceptedMeeting?.cluster,
    ...snapshot(),
    planLabels: [...result.forwardLabels, ...result.backwardLabels],
    finalPaths: (acceptedMeeting?.forwardPath && acceptedMeeting?.backwardPath)
      ? {
          forwardPath: acceptedMeeting.forwardPath,
          backwardPath: acceptedMeeting.backwardPath,
        }
      : undefined,
  });

  return frames;
}
