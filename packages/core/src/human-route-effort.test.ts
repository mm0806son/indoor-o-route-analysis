import { describe, it, expect } from "vitest";
import { analyzeThinkingEffort } from "./human-route-effort";
import type { HumanRouteResult, RouteInfo } from "./route-analyzer";

function stubRoute(distance: number, path: string[], labels: string[]): RouteInfo {
  return {
    distance,
    path,
    pathPolygons: path.map(() => undefined),
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

const sameFloorResult: HumanRouteResult = {
  route: stubRoute(50, ["S", "T"], []),
  sameFloor: true,
  forwardLabels: [],
  backwardLabels: [],
  explorationTrace: [],
  meetingAttempts: [],
};

const multiFloorResult: HumanRouteResult = {
  route: stubRoute(100, ["S", "A", "B", "C", "D", "T"], ["1", "2"]),
  sameFloor: false,
  forwardLabels: ["1"],
  backwardLabels: ["2"],
  explorationTrace: [
    { order: 0, side: "tracking", cluster: "F1", candidates: [
      { label: "1", toCluster: "F2", distanceMeters: 5 },
      { label: "3", toCluster: "F4", distanceMeters: 50 },
    ] },
    { order: 1, side: "backtracking", cluster: "F3", candidates: [{ label: "2", toCluster: "F2", distanceMeters: 5 }] },
  ],
  meetingAttempts: [{ order: 2, cluster: "F2", accepted: true }],
};

describe("analyzeThinkingEffort", () => {
  it("reports zero mental steps and plan depth for a same-floor leg", () => {
    const effort = analyzeThinkingEffort(sameFloorResult);
    expect(effort.sameFloor).toBe(true);
    expect(effort.mentalSteps).toBe(0);
    expect(effort.planDepth).toBe(0);
    expect(effort.rejectedMeetings).toBe(0);
  });

  it("counts mental steps, candidates evaluated, and plan depth for a multi-floor leg", () => {
    const effort = analyzeThinkingEffort(multiFloorResult);
    expect(effort.mentalSteps).toBe(2);
    expect(effort.candidatesEvaluated).toBe(3); // 2 from tracking + 1 from backtracking
    expect(effort.planDepth).toBe(2); // forwardLabels + backwardLabels
    expect(effort.clustersVisited.tracking).toBeGreaterThanOrEqual(1);
    expect(effort.clustersVisited.backtracking).toBeGreaterThanOrEqual(1);
  });

  it("builds a monotonically non-decreasing effort curve", () => {
    const effort = analyzeThinkingEffort(multiFloorResult);
    for (let i = 1; i < effort.effortCurve.length; i++) {
      expect(effort.effortCurve[i].cumulativeCandidatesConsidered).toBeGreaterThanOrEqual(
        effort.effortCurve[i - 1].cumulativeCandidatesConsidered,
      );
    }
    expect(effort.effortCurve[effort.effortCurve.length - 1].cumulativeCandidatesConsidered).toBe(3);
  });

  it("counts a rejected meeting without counting it as a mental step", () => {
    const withRejection: HumanRouteResult = {
      ...multiFloorResult,
      meetingAttempts: [
        { order: 1.5, cluster: "F2", accepted: false, reason: "stair-reuse" },
        { order: 2, cluster: "F2", accepted: true },
      ],
    };
    const effort = analyzeThinkingEffort(withRejection);
    expect(effort.rejectedMeetings).toBe(1);
    expect(effort.mentalSteps).toBe(2);
  });

  it("computes the human-optimal gap only when a shortest distance is supplied", () => {
    expect(analyzeThinkingEffort(multiFloorResult).humanOptimalGap).toBeUndefined();
    expect(analyzeThinkingEffort(multiFloorResult, 50).humanOptimalGap).toBeCloseTo(2);
  });

  it("gives a same-floor leg a zero cognitive-effort score and zero memory load", () => {
    const effort = analyzeThinkingEffort(sameFloorResult);
    expect(effort.cognitiveEffortScore).toBe(0);
    expect(effort.memoryLoad).toEqual({ peak: 0, average: 0 });
  });

  it("reports peak and average memory load from each step's pending-branch counts", () => {
    const withMemory: HumanRouteResult = {
      ...multiFloorResult,
      explorationTrace: [
        {
          order: 0, side: "tracking", cluster: "F1",
          candidates: [{ label: "1", toCluster: "F2", distanceMeters: 5 }],
          memory: {
            forwardChain: [], backwardChain: [], forwardPath: ["S", "S"], backwardPath: ["T", "T"],
            forwardPending: [], backwardPending: [{ cluster: "F3", label: undefined }],
          },
        },
        {
          order: 1, side: "backtracking", cluster: "F3",
          candidates: [{ label: "2", toCluster: "F2", distanceMeters: 5 }],
          memory: {
            forwardChain: [], backwardChain: [], forwardPath: ["S", "S"], backwardPath: ["T", "T"],
            forwardPending: [
              { cluster: "F2", label: "1" },
              { cluster: "F4", label: "3" },
            ],
            backwardPending: [],
          },
        },
      ],
    };
    const effort = analyzeThinkingEffort(withMemory);
    // step 0: 0 forward + 1 backward pending = 1; step 1: 2 forward + 0 backward = 2
    expect(effort.memoryLoad).toEqual({ peak: 2, average: 1.5 });
  });

  it("scores a leg with a rejected meeting higher than an otherwise-identical leg without one", () => {
    const clean = analyzeThinkingEffort(multiFloorResult);
    const withRejection = analyzeThinkingEffort({
      ...multiFloorResult,
      meetingAttempts: [
        { order: 1.5, cluster: "F2", accepted: false, reason: "stair-reuse" },
        { order: 2, cluster: "F2", accepted: true },
      ],
    });
    expect(withRejection.cognitiveEffortScore).toBeGreaterThan(clean.cognitiveEffortScore);
  });
});
