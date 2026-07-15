import { describe, it, expect } from "vitest";
import { traceToFrames } from "./human-route-frames";
import type { HumanRouteResult, RouteInfo } from "./route-analyzer";

function stubRoute(path: string[], labels: string[]): RouteInfo {
  return {
    distance: 0,
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

function sameFloorResult(): HumanRouteResult {
  return {
    route: stubRoute(["S", "T"], []),
    sameFloor: true,
    forwardLabels: [],
    backwardLabels: [],
    explorationTrace: [],
    meetingAttempts: [],
  };
}

function multiFloorResult(): HumanRouteResult {
  return {
    route: stubRoute(["S", "A", "B", "C", "D", "T"], ["1", "2"]),
    sameFloor: false,
    forwardLabels: ["1"],
    backwardLabels: ["2"],
    explorationTrace: [
      { order: 0, side: "tracking", cluster: "F1", candidates: [{ label: "1", toCluster: "F2", distanceMeters: 5 }] },
      { order: 1, side: "backtracking", cluster: "F3", candidates: [{ label: "2", toCluster: "F2", distanceMeters: 5 }] },
    ],
    meetingAttempts: [{ order: 2, cluster: "F2", accepted: true }],
  };
}

describe("traceToFrames — same floor", () => {
  it("emits a single same-floor frame with an empty plan", () => {
    const frames = traceToFrames(sameFloorResult());
    expect(frames).toHaveLength(1);
    expect(frames[0].kind).toBe("same-floor");
    expect(frames[0].planLabels).toEqual([]);
  });
});

describe("traceToFrames — multi-floor", () => {
  it("emits a leading same-floor-check frame, one exploration frame per trace step, then a closure frame", () => {
    const frames = traceToFrames(multiFloorResult());
    expect(frames.map((f) => f.kind)).toEqual(["same-floor-check", "exploration", "exploration", "closure"]);
  });

  it("the same-floor-check frame carries the route's start/end clusters", () => {
    const result: HumanRouteResult = { ...multiFloorResult(), clusterOf: { S: "F1", T: "F3" } };
    const frames = traceToFrames(result);
    expect(frames[0].cluster).toBe("F1");
    expect(frames[0].toCluster).toBe("F3");
  });

  it("falls back to the raw start/end node ids when clusterOf is absent", () => {
    const frames = traceToFrames(multiFloorResult());
    expect(frames[0].cluster).toBe("S");
    expect(frames[0].toCluster).toBe("T");
  });

  it("assembles the closure frame's plan as forward labels then backward labels", () => {
    const frames = traceToFrames(multiFloorResult());
    const closure = frames[frames.length - 1];
    expect(closure.planLabels).toEqual(["1", "2"]);
  });

  it("carries the accepted meeting's full paths onto the closure frame's memory", () => {
    const result: HumanRouteResult = {
      ...multiFloorResult(),
      meetingAttempts: [{ order: 2, cluster: "F2", accepted: true, forwardPath: ["S", "A", "B"], backwardPath: ["C", "D", "T"] }],
    };
    const frames = traceToFrames(result);
    const closure = frames[frames.length - 1];
    expect(closure.memory?.forwardPath).toEqual(["S", "A", "B"]);
    expect(closure.memory?.backwardPath).toEqual(["C", "D", "T"]);
  });

  it("has no closure memory when the accepted meeting didn't record paths", () => {
    const frames = traceToFrames(multiFloorResult());
    const closure = frames[frames.length - 1];
    expect(closure.memory).toBeUndefined();
  });

  it("passes the trace step's memory snapshot through to its exploration frame", () => {
    const memory = {
      forwardChain: [], backwardChain: [],
      forwardPath: ["S", "S"], backwardPath: ["T", "T"],
      forwardPending: [], backwardPending: [{ cluster: "F3", label: undefined }],
    };
    const result: HumanRouteResult = {
      ...multiFloorResult(),
      explorationTrace: [
        { order: 0, side: "tracking", cluster: "F1", candidates: [{ label: "1", toCluster: "F2", distanceMeters: 5 }], memory },
        { order: 1, side: "backtracking", cluster: "F3", candidates: [{ label: "2", toCluster: "F2", distanceMeters: 5 }] },
      ],
    };
    const frames = traceToFrames(result);
    expect(frames[1].memory).toEqual(memory);
    expect(frames[2].memory).toBeUndefined();
  });

  it("accumulates visited clusters per side across frames", () => {
    const frames = traceToFrames(multiFloorResult());
    const trackingFrame = frames.find((f) => f.side === "tracking")!;
    expect(trackingFrame.visitedByTracking).toEqual(expect.arrayContaining(["F1", "F2"]));

    const backtrackingFrame = frames.find((f) => f.side === "backtracking")!;
    expect(backtrackingFrame.visitedByBacktracking).toEqual(expect.arrayContaining(["F3", "F2"]));
  });

  it("orders frames chronologically by trace order, interleaving a rejected meeting", () => {
    const result: HumanRouteResult = {
      ...multiFloorResult(),
      explorationTrace: [
        { order: 0, side: "tracking", cluster: "F1", candidates: [{ label: "1", toCluster: "F2", distanceMeters: 5 }] },
        { order: 2, side: "backtracking", cluster: "F3", candidates: [{ label: "2", toCluster: "F2", distanceMeters: 5 }] },
      ],
      meetingAttempts: [
        { order: 1, cluster: "F2", accepted: false, reason: "stair-reuse" },
        { order: 3, cluster: "F2", accepted: true },
      ],
    };
    const frames = traceToFrames(result);
    expect(frames.map((f) => f.kind)).toEqual(["same-floor-check", "exploration", "meeting-rejected", "exploration", "closure"]);
    expect(frames[2].rejectedReason).toBe("stair-reuse");
  });
});
