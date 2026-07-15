import { describe, it, expect } from "vitest";
import { buildHumanRouteOverlay } from "./human-route-overlay";
import type { HumanRouteFrame } from "./human-route-frames";

function frame(overrides: Partial<HumanRouteFrame>): HumanRouteFrame {
  return {
    index: 0,
    kind: "exploration",
    visitedByTracking: [],
    visitedByBacktracking: [],
    ...overrides,
  };
}

describe("buildHumanRouteOverlay", () => {
  it("ranks candidates in the order given, marking only the first as chosen", () => {
    const overlay = buildHumanRouteOverlay(frame({
      candidates: [
        { label: "1", toCluster: "F2", distanceMeters: 3 },
        { label: "3", toCluster: "F4", distanceMeters: 9 },
      ],
    }));
    expect(overlay.candidates.map((c) => ({ label: c.label, toCluster: c.toCluster, rank: c.rank, chosen: c.chosen }))).toEqual([
      { label: "1", toCluster: "F2", rank: 1, chosen: true },
      { label: "3", toCluster: "F4", rank: 2, chosen: false },
    ]);
  });

  it("gives each candidate a distinct color and passes its real path through", () => {
    const overlay = buildHumanRouteOverlay(frame({
      candidates: [
        { label: "1", toCluster: "F2", distanceMeters: 3, path: ["origin", "A"] },
        { label: "3", toCluster: "F4", distanceMeters: 9, path: ["origin", "B"] },
      ],
    }));
    expect(overlay.candidates[0].path).toEqual(["origin", "A"]);
    expect(overlay.candidates[1].path).toEqual(["origin", "B"]);
    expect(overlay.candidates[0].color).not.toBe(overlay.candidates[1].color);
  });

  it("assigns the same color to rank 1 across different steps (deterministic by rank, not by step)", () => {
    const overlayA = buildHumanRouteOverlay(frame({
      candidates: [{ label: "1", toCluster: "F2", distanceMeters: 3 }],
    }));
    const overlayB = buildHumanRouteOverlay(frame({
      candidates: [{ label: "9", toCluster: "F9", distanceMeters: 1 }],
    }));
    expect(overlayA.candidates[0].color).toBe(overlayB.candidates[0].color);
  });

  it("has no candidates or meeting cluster outside exploration/closure frames", () => {
    const overlay = buildHumanRouteOverlay(frame({ kind: "same-floor" }));
    expect(overlay.candidates).toEqual([]);
    expect(overlay.meetingCluster).toBeUndefined();
    expect(overlay.meetingRejected).toBe(false);
  });

  it("exposes the step's origin node, distinct from candidate destinations", () => {
    const overlay = buildHumanRouteOverlay(frame({
      kind: "exploration",
      cluster: "F2",
      atNode: "node-42",
      candidates: [{ label: "1", toCluster: "F3", toNode: "node-99", distanceMeters: 5 }],
    }));
    expect(overlay.origin).toBe("node-42");
    expect(overlay.candidates[0].toNode).toBe("node-99");
  });

  it("has no origin outside exploration frames", () => {
    const overlay = buildHumanRouteOverlay(frame({ kind: "closure", atNode: "node-42" }));
    expect(overlay.origin).toBeUndefined();
  });

  it("passes the memory snapshot's node-level paths through for map rendering", () => {
    const overlay = buildHumanRouteOverlay(frame({
      kind: "exploration",
      memory: {
        forwardChain: ["1"],
        backwardChain: [],
        forwardPath: ["S", "A", "B", "B"],
        backwardPath: ["T", "T"],
        forwardPending: [],
        backwardPending: [],
      },
    }));
    expect(overlay.forwardPath).toEqual(["S", "A", "B", "B"]);
    expect(overlay.backwardPath).toEqual(["T", "T"]);
  });

  it("derives the meeting connector from the closure frame's final paths", () => {
    const overlay = buildHumanRouteOverlay(frame({
      kind: "closure",
      memory: {
        forwardChain: ["1"],
        backwardChain: ["2"],
        forwardPath: ["S", "A", "B"],
        backwardPath: ["C", "D", "T"],
        forwardPending: [],
        backwardPending: [],
      },
    }));
    expect(overlay.meetingConnector).toEqual({ from: "B", to: "C" });
  });

  it("has no meeting connector outside closure or when paths are missing", () => {
    expect(buildHumanRouteOverlay(frame({ kind: "exploration" })).meetingConnector).toBeUndefined();
    expect(buildHumanRouteOverlay(frame({ kind: "closure" })).meetingConnector).toBeUndefined();
  });

  it("has no paths when the frame carries no memory snapshot", () => {
    const overlay = buildHumanRouteOverlay(frame({ kind: "closure" }));
    expect(overlay.forwardPath).toBeUndefined();
    expect(overlay.backwardPath).toBeUndefined();
  });

  it("flags a rejected meeting at its cluster", () => {
    const overlay = buildHumanRouteOverlay(frame({
      kind: "meeting-rejected",
      cluster: "F2",
      rejectedReason: "stair-reuse",
    }));
    expect(overlay.meetingCluster).toBe("F2");
    expect(overlay.meetingRejected).toBe(true);
  });

  it("derives the accepted meeting cluster at closure from the shared visited cluster", () => {
    const overlay = buildHumanRouteOverlay(frame({
      kind: "closure",
      visitedByTracking: ["F1", "F2"],
      visitedByBacktracking: ["F3", "F2"],
    }));
    expect(overlay.meetingCluster).toBe("F2");
    expect(overlay.meetingRejected).toBe(false);
  });
});
