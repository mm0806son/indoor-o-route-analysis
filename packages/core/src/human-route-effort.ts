/**
 * Quantifies how hard a leg was to *plan* (as opposed to how hard it is to
 * run) from a human-route search's exploration trace — the article's
 * "mental work" measures. Pure, deterministic; see
 * docs/article/human-route-finding.tex.
 */

import type { HumanRouteResult } from "./route-analyzer";
import { traceToFrames } from "./human-route-frames";

export interface ThinkingEffortCurvePoint {
  frameIndex: number;
  /** Total candidate stairs considered by either side, up to and including this frame. */
  cumulativeCandidatesConsidered: number;
}

export interface ThinkingEffortMemoryLoad {
  /** The worst single moment: max (forwardPending + backwardPending) count across all exploration steps. */
  peak: number;
  /** Mean (forwardPending + backwardPending) count across all exploration steps with a memory snapshot. */
  average: number;
}

export interface ThinkingEffort {
  sameFloor: boolean;
  /** Number of expansion steps ("glances") before the plan closed. */
  mentalSteps: number;
  /** Total candidate stairs considered across all steps (a step can list several). */
  candidatesEvaluated: number;
  clustersVisited: { tracking: number; backtracking: number };
  rejectedMeetings: number;
  /** Stair crossings in the final plan — the working-memory chunks the runner must hold once it closes. */
  planDepth: number;
  /**
   * Untried-fallback-branch load per step (forwardPending.length +
   * backwardPending.length from HumanRouteMemorySnapshot) - a legitimate,
   * already-tracked measure of active working-memory burden (not the
   * "committed plan" curve rejected elsewhere, see effortCurve below).
   */
  memoryLoad: ThinkingEffortMemoryLoad;
  /** Exploration effort building up over the course of the search (not a committed-memory curve — nothing is committed until closure in this model). */
  effortCurve: ThinkingEffortCurvePoint[];
  /**
   * A single combined score for ranking/comparing legs by how hard they
   * were to *think through*. Weighted sum, weights chosen to be simple and
   * explainable rather than statistically tuned:
   *   mentalSteps * 1     - base cost of each "glance" (look around, decide)
   *   + candidatesEvaluated * 0.5  - scanning an option is cheaper than committing to an expansion
   *   + rejectedMeetings * 2       - a dead end costs double: the wasted work plus reconsidering
   *   + planDepth * 1              - each final stair crossing is a working-memory chunk to retain
   *   + memoryLoad.peak * 1.5      - the worst-moment burden weighs more than steady-state load
   * A same-floor leg scores 0 (nothing to plan).
   */
  cognitiveEffortScore: number;
  /** Route-length ratio vs. the true shortest route, when provided — a large gap flags a potential "bait" leg. */
  humanOptimalGap?: number;
}

export function analyzeThinkingEffort(result: HumanRouteResult, shortestDistanceMeters?: number): ThinkingEffort {
  const frames = traceToFrames(result);

  let candidatesEvaluated = 0;
  let mentalSteps = 0;
  let rejectedMeetings = 0;
  const clustersVisited = { tracking: 0, backtracking: 0 };
  const effortCurve: ThinkingEffortCurvePoint[] = [];
  const memoryLoadSamples: number[] = [];

  for (const frame of frames) {
    if (frame.kind === "exploration") {
      mentalSteps += 1;
      candidatesEvaluated += frame.candidates?.length ?? 0;
      if (frame.memory) {
        memoryLoadSamples.push(frame.memory.forwardPending.length + frame.memory.backwardPending.length);
      }
    } else if (frame.kind === "meeting-rejected") {
      rejectedMeetings += 1;
    }
    clustersVisited.tracking = frame.visitedByTracking.length;
    clustersVisited.backtracking = frame.visitedByBacktracking.length;
    effortCurve.push({ frameIndex: frame.index, cumulativeCandidatesConsidered: candidatesEvaluated });
  }

  const planDepth = result.sameFloor ? 0 : result.forwardLabels.length + result.backwardLabels.length;

  const memoryLoad: ThinkingEffortMemoryLoad = memoryLoadSamples.length > 0
    ? {
        peak: Math.max(...memoryLoadSamples),
        average: memoryLoadSamples.reduce((sum, n) => sum + n, 0) / memoryLoadSamples.length,
      }
    : { peak: 0, average: 0 };

  const cognitiveEffortScore =
    mentalSteps * 1 +
    candidatesEvaluated * 0.5 +
    rejectedMeetings * 2 +
    planDepth * 1 +
    memoryLoad.peak * 1.5;

  const humanOptimalGap = shortestDistanceMeters && shortestDistanceMeters > 0
    ? result.route.distance / shortestDistanceMeters
    : undefined;

  return {
    sameFloor: result.sameFloor,
    mentalSteps,
    candidatesEvaluated,
    clustersVisited,
    rejectedMeetings,
    planDepth,
    memoryLoad,
    effortCurve,
    cognitiveEffortScore,
    humanOptimalGap,
  };
}
