import { describe, it, expect } from "vitest";
import { findHumanRoute, type HumanRouteGraphContext } from "./human-route";
import type { Node, Edge } from "./models/graph";

function node(id: string, x: number, y: number): Node {
  return { id, x, y };
}

/** Builds a minimal graph context: nodes on a single straight line, so
 * "distance" is just the difference in an arbitrary 1D coordinate. */
function makeContext(nodes: Node[], edges: Edge[]): HumanRouteGraphContext {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    edges,
    resolveNode: (id) => byId.get(id) ?? null,
    edgeDistanceMeters: (edge, from, to) => {
      if (edge.ignoreLength) return 0;
      const a = from as Node;
      const b = to as Node;
      return Math.hypot(b.x - a.x, b.y - a.y);
    },
    getCoordinates: (item) => ({ x: (item as Node).x, y: (item as Node).y }),
    mapScale: 1,
  };
}

describe("findHumanRoute — same-floor short-circuit", () => {
  it("solves a leg directly when only unlabeled corridors are needed", () => {
    const nodes = [node("S", 0, 0), node("A", 10, 0), node("T", 20, 0)];
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "A", to: "T", label: "" },
    ];
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result).not.toBeNull();
    expect(result!.sameFloor).toBe(true);
    expect(result!.path).toEqual(["S", "A", "T"]);
    expect(result!.trace.steps).toEqual([]);
  });

  it("uses a one-way corridor in its legal direction for the same-floor check", () => {
    const nodes = [node("S", 0, 0), node("T", 10, 0)];
    const edges: Edge[] = [{ from: "S", to: "T", label: "", oneWay: true }];
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result?.sameFloor).toBe(true);
  });

  it("does not use a one-way corridor against its direction", () => {
    const nodes = [node("S", 0, 0), node("T", 10, 0)];
    const edges: Edge[] = [{ from: "T", to: "S", label: "", oneWay: true }];
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    // No same-floor path S->T; no stairs exist either, so no route at all.
    expect(result).toBeNull();
  });
});

describe("findHumanRoute — multi-floor planning", () => {
  // Three floor clusters chained by two stairs: F1{S,A} -1- F2{B,C} -2- F3{D,T}
  const nodes = [
    node("S", 0, 0), node("A", 5, 0),
    node("B", 5, 100), node("C", 15, 100),
    node("D", 15, 200), node("T", 20, 200),
  ];
  const edges: Edge[] = [
    { from: "S", to: "A", label: "" },
    { from: "B", to: "C", label: "" },
    { from: "D", to: "T", label: "" },
    { from: "A", to: "B", label: "1", reverseLabel: "1", ignoreLength: true },
    { from: "C", to: "D", label: "2", reverseLabel: "2", ignoreLength: true },
  ];

  it("plans bidirectionally and composes forward + backward labels in order", () => {
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result).not.toBeNull();
    expect(result!.sameFloor).toBe(false);
    expect(result!.forwardLabels).toEqual(["1"]);
    expect(result!.backwardLabels).toEqual(["2"]);
    expect(result!.path[0]).toBe("S");
    expect(result!.path[result!.path.length - 1]).toBe("T");
  });

  it("records one tracking step and one backtracking step in the trace", () => {
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    const sides = result!.trace.steps.map((s) => s.side);
    expect(sides).toEqual(["tracking", "backtracking"]);
    expect(result!.trace.steps[0].candidates.map((c) => c.label)).toEqual(["1"]);
    expect(result!.trace.steps[1].candidates.map((c) => c.label)).toEqual(["2"]);
  });

  it("gives each candidate the real same-floor path to its stair, not just a distance", () => {
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    // Tracking candidate "1": same-floor walk from S to the stair's near-side node A.
    expect(result!.trace.steps[0].candidates[0].path).toEqual(["S", "A"]);
    // Backtracking candidate "2": same-floor walk from the stair's near-side node D to T.
    expect(result!.trace.steps[1].candidates[0].path).toEqual(["D", "T"]);
  });

  it("records exactly one accepted meeting attempt", () => {
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result!.trace.meetingAttempts).toEqual([
      {
        order: expect.any(Number),
        cluster: expect.any(String),
        accepted: true,
        forwardPath: ["S", "A", "B"],
        backwardPath: ["C", "D", "T"],
      },
    ]);
  });

  it("is deterministic across repeated runs", () => {
    const a = findHumanRoute("S", "T", makeContext(nodes, edges));
    const b = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(a).toEqual(b);
  });

  it("prefers the nearer of two candidate stairs from the same cluster", () => {
    // Add a second, farther stair from the start cluster to a dead end —
    // the nearer stair (label "1") should still be explored first.
    const withExtra: Edge[] = [
      ...edges,
      { from: "A", to: "far", label: "3", reverseLabel: "3", ignoreLength: true },
    ];
    const extraNodes = [...nodes, node("far", 500, 0), node("farFloor", 500, 300)];
    const withFarEdge: Edge[] = [...withExtra, { from: "far", to: "farFloor", label: "" }];
    const result = findHumanRoute("S", "T", makeContext(extraNodes, withFarEdge));
    expect(result!.forwardLabels).toEqual(["1"]);
  });

  describe("working-memory snapshot", () => {
    it("captures an empty committed chain and the seed pending branch before any expansion completes", () => {
      const result = findHumanRoute("S", "T", makeContext(nodes, edges));
      const trackingStep = result!.trace.steps[0];
      expect(trackingStep.memory).toEqual({
        forwardChain: [],
        backwardChain: [],
        forwardPath: ["S", "S"],
        backwardPath: ["T", "T"],
        forwardPending: [],
        backwardPending: [{ cluster: expect.any(String), label: undefined }],
      });
    });

    it("records the other side's newly opened branch by the second step", () => {
      const result = findHumanRoute("S", "T", makeContext(nodes, edges));
      const backtrackStep = result!.trace.steps[1];
      expect(backtrackStep.memory).toEqual({
        forwardChain: [],
        backwardChain: [],
        forwardPath: ["S", "S"],
        backwardPath: ["T", "T"],
        forwardPending: [{ cluster: expect.any(String), label: "1" }],
        backwardPending: [],
      });
    });

    it("builds node-level waypoints for the committed path once a stair has been crossed", () => {
      // A deeper chain forces the forward side to expand twice before
      // meeting: F1{S,A} -1- F2{B,C} -2- F3{D,E} -3- F4{G,T}. Backward's
      // first hop (via "3") reaches F3 before forward's second hop (via
      // "2") does, so the second tracking step's snapshot reflects the
      // already-crossed stair "1" in its committed path.
      const deepNodes = [
        node("S", 0, 0), node("A", 5, 0),
        node("B", 5, 100), node("C", 15, 100),
        node("D", 15, 200), node("E", 25, 200),
        node("G", 25, 300), node("T", 30, 300),
      ];
      const deepEdges: Edge[] = [
        { from: "S", to: "A", label: "" },
        { from: "B", to: "C", label: "" },
        { from: "D", to: "E", label: "" },
        { from: "G", to: "T", label: "" },
        { from: "A", to: "B", label: "1", reverseLabel: "1", ignoreLength: true },
        { from: "C", to: "D", label: "2", reverseLabel: "2", ignoreLength: true },
        { from: "E", to: "G", label: "3", reverseLabel: "3", ignoreLength: true },
      ];
      const result = findHumanRoute("S", "T", makeContext(deepNodes, deepEdges));
      const trackingSteps = result!.trace.steps.filter((s) => s.side === "tracking");
      expect(trackingSteps).toHaveLength(2);
      expect(trackingSteps[1].memory?.forwardPath).toEqual(["S", "A", "B", "B"]);
      expect(trackingSteps[1].memory?.forwardChain).toEqual(["1"]);
    });

    it("keeps a discarded candidate on the pending stack as a fallback even once a better one is chosen", () => {
      // Same dead-end fixture as above: from cluster F1, "1" (to B) is nearer
      // to the target than "3" (to far) - "3" is still pushed as a fallback.
      const withExtra: Edge[] = [
        ...edges,
        { from: "A", to: "far", label: "3", reverseLabel: "3", ignoreLength: true },
      ];
      const extraNodes = [...nodes, node("far", 500, 0), node("farFloor", 500, 300)];
      const withFarEdge: Edge[] = [...withExtra, { from: "far", to: "farFloor", label: "" }];
      const result = findHumanRoute("S", "T", makeContext(extraNodes, withFarEdge));
      const backtrackStep = result!.trace.steps.find((s) => s.side === "backtracking")!;
      expect(backtrackStep.memory!.forwardPending.map((p) => p.label)).toEqual(["3", "1"]);
    });
  });

  describe("clusterOf mapping", () => {
    it("groups same-floor nodes under one cluster id and keeps stair-separated floors apart", () => {
      const result = findHumanRoute("S", "T", makeContext(nodes, edges));
      const clusterOf = result!.clusterOf!;
      expect(clusterOf.S).toBe(clusterOf.A);
      expect(clusterOf.B).toBe(clusterOf.C);
      expect(clusterOf.D).toBe(clusterOf.T);
      expect(new Set([clusterOf.S, clusterOf.B, clusterOf.D]).size).toBe(3);
    });
  });
});

describe("findHumanRoute — clusterOf on the same-floor path", () => {
  it("is absent when the same-floor short-circuit solves the leg", () => {
    const nodes = [node("S", 0, 0), node("A", 10, 0), node("T", 20, 0)];
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "A", to: "T", label: "" },
    ];
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result!.clusterOf).toBeUndefined();
  });
});

describe("findHumanRoute — one-way stairs", () => {
  it("respects one-way stair direction on the tracking side", () => {
    // Stair only traversable A -> B (uphill); no reverseLabel/bidirectional entry.
    const nodes = [node("S", 0, 0), node("A", 5, 0), node("B", 5, 100), node("T", 20, 100)];
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "B", to: "T", label: "" },
      { from: "A", to: "B", label: "1", oneWay: true, ignoreLength: true },
    ];
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result).not.toBeNull();
    expect(result!.forwardLabels).toEqual(["1"]);
  });

  it("does not traverse a one-way stair against its direction", () => {
    // Stair only traversable B -> A; going S -> T (which would need A -> B) must fail.
    const nodes = [node("S", 0, 0), node("A", 5, 0), node("B", 5, 100), node("T", 20, 100)];
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "B", to: "T", label: "" },
      { from: "B", to: "A", label: "1", oneWay: true, ignoreLength: true },
    ];
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result).toBeNull();
  });
});

describe("findHumanRoute — no route", () => {
  it("returns null when the graph is disconnected", () => {
    const nodes = [node("S", 0, 0), node("T", 100, 100)];
    const edges: Edge[] = [];
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result).toBeNull();
  });
});

describe("findHumanRoute — configurable candidate ordering (HumanModelParams)", () => {
  // Same base chain as "multi-floor planning" above (F1{S,A}-1-F2{B,C}-2-F3{D,T}),
  // plus two dead-end decoy stairs from the start cluster: "X" is nearest but
  // leads far from the target; "Y" is farthest but leads close to the target.
  const nodes = [
    node("S", 0, 0), node("A", 5, 0),
    node("B", 5, 100), node("C", 15, 100),
    node("D", 15, 200), node("T", 20, 200),
    node("PX", 2, 0), node("QX", 2, -1000),
    node("PY", 50, 0), node("QY", 50, 190),
  ];
  const edges: Edge[] = [
    { from: "S", to: "A", label: "" },
    { from: "S", to: "PX", label: "" },
    { from: "S", to: "PY", label: "" },
    { from: "B", to: "C", label: "" },
    { from: "D", to: "T", label: "" },
    { from: "A", to: "B", label: "1", reverseLabel: "1", ignoreLength: true },
    { from: "C", to: "D", label: "2", reverseLabel: "2", ignoreLength: true },
    { from: "PX", to: "QX", label: "X", reverseLabel: "X", ignoreLength: true },
    { from: "PY", to: "QY", label: "Y", reverseLabel: "Y", ignoreLength: true },
  ];

  it("orders candidates by nearest corridor distance by default, ignoring goal direction", () => {
    const result = findHumanRoute("S", "T", makeContext(nodes, edges));
    expect(result).not.toBeNull();
    // PX (distance 2) is nearer than A (distance 5) and PY (distance 50),
    // even though its dead end (QX) is far from T and PY's dead end (QY) is close.
    expect(result!.trace.steps[0].candidates.map((c) => c.label)).toEqual(["X", "1", "Y"]);
    // The route still closes via the real chain - dead ends just waste a turn each.
    expect(result!.forwardLabels).toEqual(["1"]);
  });

  it("reorders candidates by goal direction when nearness is weighted out", () => {
    const result = findHumanRoute("S", "T", {
      ...makeContext(nodes, edges),
      params: { orderingWeights: { nearness: 0, goalDirection: 1 } },
    });
    expect(result).not.toBeNull();
    // With nearness weighted to zero, whichever candidate's dead end sits
    // closest to the target (QY, near T) sorts first, regardless of corridor distance.
    expect(result!.trace.steps[0].candidates.map((c) => c.label)).toEqual(["Y", "1", "X"]);
    expect(result!.forwardLabels).toEqual(["1"]);
  });

  it("blends both factors when both weights are nonzero", () => {
    // straightLineToTarget is scaled by mapScale * MM_TO_METERS (0.001) while
    // this fixture's edgeDistanceMeters is raw hypot, so goalDirection needs a
    // large-enough weight to matter at all - with it, Y (worst on nearness,
    // best on direction) still overtakes "1" (middling on both).
    const result = findHumanRoute("S", "T", {
      ...makeContext(nodes, edges),
      params: { orderingWeights: { nearness: 1, goalDirection: 1000 } },
    });
    expect(result!.trace.steps[0].candidates[0].label).toBe("Y");
  });
});

describe("findHumanRoute — directed corridor seams", () => {
  const nodes = "SABCDEFGT".split("").map((id, i) => node(id, i * 10, 0));
  const corridor = (from: string, to: string): Edge => ({ from, to, label: "", oneWay: true });
  const stair = (from: string, to: string, label: string): Edge => ({ from, to, label, oneWay: true });

  it.each([
    { name: "before a stair", edges: [corridor("S", "A"), stair("A", "T", "Y")] },
    { name: "after a stair", edges: [stair("S", "A", "Y"), corridor("A", "T")] },
    { name: "between stairs", edges: [stair("S", "A", "X"), corridor("A", "B"), stair("B", "T", "Y")] },
    { name: "multiple seams and a cycle", edges: [corridor("S", "A"), corridor("A", "B"), corridor("B", "A"), corridor("B", "C"), stair("C", "T", "Y")] },
    { name: "multiple entrances", edges: [corridor("S", "A"), corridor("S", "B"), corridor("A", "C"), corridor("B", "C"), stair("C", "T", "Y")] },
    { name: "target-side backward glance", edges: [stair("S", "A", "X"), stair("A", "B", "Y"), corridor("B", "C"), corridor("C", "T")] },
  ])("walks $name legally without fictitious stairs", ({ edges }) => {
    const ctx = makeContext(nodes, edges);
    const result = findHumanRoute("S", "T", ctx);
    expect(result).not.toBeNull();
    for (let i = 1; i < result!.path.length; i++) {
      expect(edges.some(e => e.from === result!.path[i - 1] && e.to === result!.path[i])).toBe(true);
    }
    const expectedLabels = edges.filter(e => e.label).map(e => e.label);
    expect([...result!.forwardLabels, ...result!.backwardLabels]).toEqual(expectedLabels);
    for (const step of result!.trace.steps) {
      expect(step.candidates.every(c => !!c.label)).toBe(true);
      expect(step.memory!.forwardChain.every(Boolean)).toBe(true);
      expect(step.memory!.backwardChain.every(Boolean)).toBe(true);
    }
    expect(findHumanRoute("T", "S", ctx)).toBeNull();
  });

  it("includes corridor seams in the candidate's real walking path", () => {
    const result = findHumanRoute("S", "T", makeContext(nodes, [
      corridor("S", "A"), corridor("A", "B"), stair("B", "T", "Y"),
    ]));
    expect(result!.trace.steps[0].candidates[0].path).toEqual(["S", "A", "B"]);
    expect(result!.trace.steps[0].candidates[0].distanceMeters).toBe(20);
  });

  it("does not reach a stair across a reversed corridor", () => {
    expect(findHumanRoute("S", "T", makeContext(nodes, [
      corridor("A", "S"), stair("A", "T", "Y"),
    ]))).toBeNull();
  });
});
