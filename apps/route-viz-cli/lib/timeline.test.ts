import type { RouteInfo, TraceEvent } from "@indoor-o-route-analysis/core";
import { describe, expect, it } from "vitest";
import { buildFrameStates, type ContentPhaseName, MIN_PHASE_DURATION_SECONDS, planPhases } from "./timeline";

function makeRoute(path: string[], distance: number, difficulty: number): RouteInfo {
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
    description: "",
    labels: [],
    difficulty,
  };
}

const fps = 10;
const ALL_PHASES: ContentPhaseName[] = ["shortest", "easiest", "human", "all-routes"];

describe("planPhases", () => {
  it("clamps to the per-phase floor when the requested duration is too short", () => {
    const phases = planPhases(["shortest"], 0.5, fps);
    const byName = new Map(phases.map((p) => [p.name, p]));
    expect(byName.get("shortest")?.frameCount).toBe(Math.round(MIN_PHASE_DURATION_SECONDS * fps));
  });

  it("gives each selected phase the FULL duration — it is not split across phases", () => {
    const onePhase = planPhases(["shortest"], 10, fps);
    const twoPhases = planPhases(["shortest", "easiest"], 10, fps);

    const shortestAlone = onePhase.find((p) => p.name === "shortest")?.frameCount;
    const shortestCombined = twoPhases.find((p) => p.name === "shortest")?.frameCount;
    const easiestCombined = twoPhases.find((p) => p.name === "easiest")?.frameCount;

    // Adding a second selected phase does not shrink the first phase's time.
    expect(shortestCombined).toBe(shortestAlone);
    expect(easiestCombined).toBe(shortestAlone);
  });

  it("only includes selected phases, always in canonical order", () => {
    // Passed in a scrambled order — output must still follow shortest, easiest, human, all-routes.
    const phases = planPhases(["all-routes", "shortest"], 10, fps);
    const names = phases.map((p) => p.name);
    expect(names).toEqual(["intro", "shortest", "all-routes", "outro"]);
    expect(names).not.toContain("easiest");
    expect(names).not.toContain("human");
  });

  it("produces contiguous, non-overlapping phases", () => {
    const phases = planPhases(ALL_PHASES, 10, fps);
    let expectedStart = 0;
    for (const phase of phases) {
      expect(phase.startFrame).toBe(expectedStart);
      expectedStart += phase.frameCount;
    }
  });

  it("lengthens the video as more phases are selected, rather than dividing a fixed total", () => {
    const one = planPhases(["shortest"], 10, fps).reduce((sum, p) => sum + p.frameCount, 0);
    const all = planPhases(ALL_PHASES, 10, fps).reduce((sum, p) => sum + p.frameCount, 0);
    expect(all).toBeGreaterThan(one);
  });
});

describe("buildFrameStates", () => {
  const shortest = makeRoute(["a", "b"], 100, 50);
  const easiest = makeRoute(["a", "c", "b"], 150, 20);
  const human = makeRoute(["a", "c", "b"], 150, 20);

  const events: TraceEvent[] = [
    { kind: "node-settled", seq: 0, algorithm: "all-routes", nodeId: "a", distance: 0 },
    { kind: "edge-evaluated", seq: 1, algorithm: "all-routes", fromNodeId: "a", toNodeId: "b", relaxed: true, distance: 100 },
    { kind: "node-settled", seq: 2, algorithm: "all-routes", nodeId: "b", distance: 100 },
    { kind: "route-found", seq: 3, algorithm: "all-routes", route: shortest, rank: 0 },
    { kind: "edge-evaluated", seq: 4, algorithm: "all-routes", fromNodeId: "a", toNodeId: "c", relaxed: true, distance: 50 },
    { kind: "node-settled", seq: 5, algorithm: "all-routes", nodeId: "c", distance: 50 },
    { kind: "edge-evaluated", seq: 6, algorithm: "all-routes", fromNodeId: "c", toNodeId: "b", relaxed: true, distance: 150 },
    { kind: "route-found", seq: 7, algorithm: "all-routes", route: easiest, rank: 1 },
  ];

  const humanEvents: TraceEvent[] = [
    { kind: "node-settled", seq: 0, algorithm: "human-route", nodeId: "a", distance: 0 },
    { kind: "edge-evaluated", seq: 1, algorithm: "human-route", fromNodeId: "a", toNodeId: "c", relaxed: true, distance: 50 },
    { kind: "node-settled", seq: 2, algorithm: "human-route", nodeId: "c", distance: 50 },
    { kind: "route-found", seq: 3, algorithm: "human-route", route: human, rank: 0 },
  ];

  const captions = {
    intro: { caption: "Intro" },
    shortest: { caption: "Shortest" },
    easiest: { caption: "Easiest" },
    human: { caption: "Human" },
    allRoutes: { caption: "All routes" },
    outro: { caption: "Outro" },
  };
  const allRoutes = [shortest, easiest];
  const routeColors = {
    shortest: "#0ff",
    easiest: "#0f0",
    human: "#f80",
    allRoutesPalette: ["#111", "#222"],
    allRoutesFoundFlash: "#eee",
    allRoutesAlpha: 0.55,
  };

  function build(selectedPhases: ContentPhaseName[], overrides: Partial<Parameters<typeof buildFrameStates>[0]> = {}) {
    const phases = planPhases(selectedPhases, 10, fps);
    return buildFrameStates({
      selectedPhases,
      events,
      shortest,
      easiest,
      allRoutes,
      human,
      humanEvents,
      phases,
      fps,
      captions,
      routeColors,
      ...overrides,
    });
  }

  it("produces exactly the total number of frames planned across all phases", () => {
    const selectedPhases = ALL_PHASES;
    const phases = planPhases(selectedPhases, 10, fps);
    const frames = build(selectedPhases);
    const totalFrames = phases.reduce((sum, p) => sum + p.frameCount, 0);
    expect(frames).toHaveLength(totalFrames);
  });

  it("only produces frames for the selected phases", () => {
    const frames = build(["shortest"]);
    const phasesPresent = new Set(frames.map((f) => f.phase));
    expect(phasesPresent).toEqual(new Set(["intro", "shortest", "outro"]));
  });

  it("reveals the shortest route only after its route-found event, then holds it", () => {
    const frames = build(ALL_PHASES);
    const shortestFrames = frames.filter((f) => f.phase === "shortest");

    // Somewhere in the phase the shortest route becomes visible...
    const firstRevealIdx = shortestFrames.findIndex((f) => f.highlightedRoutes.length > 0);
    expect(firstRevealIdx).toBeGreaterThanOrEqual(0);
    // ...and stays visible for the rest of the phase (hold sub-phase).
    for (let i = firstRevealIdx; i < shortestFrames.length; i++) {
      expect(shortestFrames[i].highlightedRoutes[0]?.path).toEqual(shortest.path);
    }
    // The very last frame of the phase is fully revealed (progress 1).
    expect(shortestFrames[shortestFrames.length - 1].highlightedRoutes[0].progress).toBe(1);
  });

  it("builds the human phase from its own separate trace, not the shared events", () => {
    const frames = build(["human"]);
    const humanFrames = frames.filter((f) => f.phase === "human");
    expect(humanFrames.length).toBeGreaterThan(0);

    const firstRevealIdx = humanFrames.findIndex((f) => f.highlightedRoutes.length > 0);
    expect(firstRevealIdx).toBeGreaterThanOrEqual(0);
    expect(humanFrames[humanFrames.length - 1].highlightedRoutes[0]?.path).toEqual(human.path);
    expect(humanFrames[humanFrames.length - 1].highlightedRoutes[0]?.color).toBe(routeColors.human);
  });

  it("skips the human phase entirely when no human route was found", () => {
    const frames = build(["human"], { human: undefined, humanEvents: undefined });
    expect(frames.some((f) => f.phase === "human")).toBe(false);
  });

  it("accumulates all discovered routes by the end of the all-routes phase", () => {
    const frames = build(ALL_PHASES);
    const allRoutesFrames = frames.filter((f) => f.phase === "all-routes");
    const lastFrame = allRoutesFrames[allRoutesFrames.length - 1];

    expect(lastFrame.highlightedRoutes).toHaveLength(2);
    expect(lastFrame.highlightedRoutes.every((r) => r.progress === 1)).toBe(true);
  });

  it("reveals all-routes shortest-to-longest, drawing the shortest last (on top)", () => {
    const frames = build(ALL_PHASES);
    const allRoutesFrames = frames.filter((f) => f.phase === "all-routes");

    // The shortest route (distance 100) is drawn last in every frame's array
    // (z-order), so it paints on top of the longer easiest route (distance 150).
    for (const frame of allRoutesFrames) {
      if (frame.highlightedRoutes.length < 2) continue;
      const paths = frame.highlightedRoutes.map((r) => r.path);
      expect(paths[paths.length - 1]).toEqual(shortest.path);
      return; // found at least one frame with both revealed — assertion made
    }
    throw new Error("expected at least one frame with both routes revealed");
  });

  it("applies the configured alpha to every route in the all-routes swarm", () => {
    const frames = build(ALL_PHASES);
    const lastFrame = frames.filter((f) => f.phase === "all-routes").at(-1);

    expect(lastFrame?.highlightedRoutes.every((r) => r.alpha === routeColors.allRoutesAlpha)).toBe(true);
  });

  it("flashes big when the shortest route, the easiest route, and the all-routes search are found", () => {
    const frames = build(ALL_PHASES);

    for (const phaseName of ["shortest", "easiest", "all-routes"] as const) {
      const phaseFrames = frames.filter((f) => f.phase === phaseName);
      expect(phaseFrames.some((f) => (f.screenFlash?.intensity ?? 0) > 0)).toBe(true);
      // The flash fades out — it isn't still at full intensity by the last frame.
      expect(phaseFrames[phaseFrames.length - 1].screenFlash?.intensity ?? 0).toBeLessThan(1);
    }
  });

  it("skips the redundant search replay when easiest and shortest are the same route", () => {
    const frames = build(["shortest", "easiest"], { easiest: shortest });
    const easiestFrames = frames.filter((f) => f.phase === "easiest");
    // Every frame in the phase already shows the (fully revealed) route — no search sub-phase.
    expect(easiestFrames.every((f) => f.highlightedRoutes[0]?.progress === 1)).toBe(true);
  });

  it("holds the outro on whatever the last selected phase left on screen", () => {
    // Only "shortest" selected — the outro should carry its final highlight
    // forward rather than assuming all-routes (or any other fixed phase) ran.
    const frames = build(["shortest"]);
    const outroFrames = frames.filter((f) => f.phase === "outro");
    const lastShortestFrame = frames.filter((f) => f.phase === "shortest").at(-1);

    expect(outroFrames.length).toBeGreaterThan(0);
    expect(outroFrames[0].highlightedRoutes).toEqual(lastShortestFrame?.highlightedRoutes);
  });
});
