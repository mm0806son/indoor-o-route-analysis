import { describe, expect, it } from "vitest";
import type {
  MinimalCanvas2DContext,
  RouteVizFrameState,
  VizEdge,
  VizLayout,
} from "./route-viz-renderer";
import { renderRouteVizFrame, drawMutedGraph } from "./route-viz-renderer";

function createMockContext(): { ctx: MinimalCanvas2DContext; calls: string[] } {
  const calls: string[] = [];
  const ctx: MinimalCanvas2DContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: "",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect: (...args: number[]) => calls.push(`fillRect(${args.join(",")})`),
    beginPath: () => calls.push("beginPath"),
    moveTo: (...args: number[]) => calls.push(`moveTo(${args.join(",")})`),
    lineTo: (...args: number[]) => calls.push(`lineTo(${args.join(",")})`),
    arc: (...args: number[]) => calls.push(`arc(${args.join(",")})`),
    stroke: () => calls.push(`stroke(shadowBlur=${ctx.shadowBlur})`),
    fill: () => calls.push("fill"),
    fillText: (text: string) => calls.push(`fillText(${text})`),
    setLineDash: (segments: number[]) =>
      calls.push(`setLineDash(${segments.join(",")})`),
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
  };
  return { ctx, calls };
}

const layout: VizLayout = {
  positions: new Map([
    ["a", { x: 10, y: 10 }],
    ["b", { x: 90, y: 10 }],
    ["c", { x: 90, y: 90 }],
  ]),
  width: 200,
  height: 100,
};

const edges: VizEdge[] = [
  { from: "a", to: "b" },
  { from: "b", to: "c" },
];

const legControls = { fromNodeId: "a", toNodeId: "c" };

function emptyFrame(
  overrides: Partial<RouteVizFrameState> = {},
): RouteVizFrameState {
  return {
    phase: "intro",
    caption: "Test caption",
    flash: { nodeFlash: new Map(), edgeFlash: new Map() },
    highlightedRoutes: [],
    ...overrides,
  };
}

describe("renderRouteVizFrame", () => {
  it("draws the background exactly once, sized to the layout", () => {
    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(ctx, edges, layout, legControls, emptyFrame());

    expect(calls.filter((c) => c.startsWith("fillRect"))).toEqual([
      `fillRect(0,0,${layout.width},${layout.height})`,
    ]);
  });

  it("draws every graph node as a muted circle", () => {
    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(ctx, edges, layout, legControls, emptyFrame());

    const arcCalls = calls.filter((c) => c.startsWith("arc"));
    expect(arcCalls.length).toBeGreaterThanOrEqual(layout.positions.size);
  });

  it("draws ignoreLength edges dashed and ordinary edges solid", () => {
    const edgesWithStairs: VizEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c", ignoreLength: true },
    ];
    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(
      ctx,
      edgesWithStairs,
      layout,
      legControls,
      emptyFrame(),
    );

    const dashCalls = calls.filter((c) => c.startsWith("setLineDash"));
    // Reset to solid, draw solid edges; switch to dashed, draw dashed edges; reset back to solid.
    expect(dashCalls).toEqual([
      "setLineDash()",
      "setLineDash(6,4)",
      "setLineDash()",
    ]);
  });

  it("dashes the segment of a highlighted route that crosses an ignoreLength edge", () => {
    const edgesWithStairs: VizEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c", ignoreLength: true },
    ];
    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(
      ctx,
      edgesWithStairs,
      layout,
      legControls,
      emptyFrame({
        highlightedRoutes: [
          { path: ["a", "b", "c"], color: "#00F5D4", progress: 1 },
        ],
      }),
    );

    // Two route segments are drawn (a-b solid, b-c dashed), on top of the
    // muted graph's own solid/dashed passes.
    const dashCalls = calls.filter((c) => c.startsWith("setLineDash"));
    expect(dashCalls).toEqual([
      "setLineDash()", // muted graph: solid pass
      "setLineDash(6,4)", // muted graph: dashed pass
      "setLineDash()", // muted graph: reset
      "setLineDash()", // route segment a-b: solid
      "setLineDash(6,4)", // route segment b-c: dashed
      "setLineDash()", // route: reset
    ]);
  });

  it("draws an extra glowing arc for a flashed node", () => {
    const { ctx: baseCtx, calls: baseCalls } = createMockContext();
    renderRouteVizFrame(baseCtx, edges, layout, legControls, emptyFrame());

    const { ctx, calls } = createMockContext();
    const flash = { nodeFlash: new Map([["a", 1]]), edgeFlash: new Map() };
    renderRouteVizFrame(ctx, edges, layout, legControls, emptyFrame({ flash }));

    const arcCallsBase = baseCalls.filter((c) => c.startsWith("arc")).length;
    const arcCallsFlashed = calls.filter((c) => c.startsWith("arc")).length;
    expect(arcCallsFlashed).toBe(arcCallsBase + 1);
  });

  it("draws a highlighted route as a stroked polyline", () => {
    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(
      ctx,
      edges,
      layout,
      legControls,
      emptyFrame({
        highlightedRoutes: [
          { path: ["a", "b", "c"], color: "#00F5D4", progress: 1 },
        ],
      }),
    );

    expect(calls).toContain("moveTo(10,10)");
    expect(calls).toContain("lineTo(90,10)");
    expect(calls).toContain("lineTo(90,90)");
  });

  it("only partially reveals a route when progress < 1", () => {
    // The muted graph itself already draws an a-b-c polyline (edges fixture),
    // so "reaching node c" must be checked by count, not by presence: the
    // route highlight should NOT contribute its own extra lineTo(90,90) at
    // progress 0.25 (halfway through the first of 2 segments), but should at
    // progress 1.
    const { ctx: partialCtx, calls: partialCalls } = createMockContext();
    renderRouteVizFrame(
      partialCtx,
      edges,
      layout,
      legControls,
      emptyFrame({
        highlightedRoutes: [
          { path: ["a", "b", "c"], color: "#00F5D4", progress: 0.25 },
        ],
      }),
    );

    const { ctx: fullCtx, calls: fullCalls } = createMockContext();
    renderRouteVizFrame(
      fullCtx,
      edges,
      layout,
      legControls,
      emptyFrame({
        highlightedRoutes: [
          { path: ["a", "b", "c"], color: "#00F5D4", progress: 1 },
        ],
      }),
    );

    const countLineToC = (calls: string[]) =>
      calls.filter((c) => c === "lineTo(90,90)").length;
    expect(countLineToC(fullCalls)).toBe(countLineToC(partialCalls) + 1);
  });

  it("glows while a route is being revealed, but not once it's finished", () => {
    const revealing = createMockContext();
    renderRouteVizFrame(
      revealing.ctx,
      edges,
      layout,
      legControls,
      emptyFrame({
        highlightedRoutes: [
          { path: ["a", "b", "c"], color: "#00F5D4", progress: 0.5 },
        ],
      }),
    );

    const finished = createMockContext();
    renderRouteVizFrame(
      finished.ctx,
      edges,
      layout,
      legControls,
      emptyFrame({
        highlightedRoutes: [
          { path: ["a", "b", "c"], color: "#00F5D4", progress: 1 },
        ],
      }),
    );

    const strokeCalls = (calls: string[]) =>
      calls.filter((c) => c.startsWith("stroke(shadowBlur="));

    // Mid-reveal, at least one stroke (the route itself) glows.
    expect(
      strokeCalls(revealing.calls).some((c) => c !== "stroke(shadowBlur=0)"),
    ).toBe(true);
    // Once finished, every stroke in the frame (muted graph + the now-crisp route) has no glow.
    expect(
      strokeCalls(finished.calls).every((c) => c === "stroke(shadowBlur=0)"),
    ).toBe(true);
  });

  it("renders the caption text", () => {
    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(
      ctx,
      edges,
      layout,
      legControls,
      emptyFrame({ caption: "Shortest route", subcaption: "287 m" }),
    );

    expect(calls).toContain("fillText(Shortest route)");
    expect(calls).toContain("fillText(287 m)");
  });

  it("draws purple rings at the leg's start/end controls connected by a line", () => {
    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(ctx, edges, layout, legControls, emptyFrame());

    // A ring at "a" (10,10) and one at "c" (90,90), plus the connecting line.
    expect(calls.some((c) => c.startsWith("arc(10,10,"))).toBe(true);
    expect(calls.some((c) => c.startsWith("arc(90,90,"))).toBe(true);
    expect(calls).toContain("moveTo(10,10)");
    expect(calls).toContain("lineTo(90,90)");
  });

  it("draws a big screen flash wash and shockwave ring when provided", () => {
    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(
      ctx,
      edges,
      layout,
      legControls,
      emptyFrame({
        screenFlash: { color: "#ffffff", intensity: 1, centerNodeId: "c" },
      }),
    );

    expect(calls).toContain(`fillRect(0,0,${layout.width},${layout.height})`);
    // The shockwave ring is centered on "c" — an arc whose first two
    // coordinates match its position.
    expect(calls.some((c) => c.startsWith("arc(90,90,"))).toBe(true);
  });

  it("skips the screen flash entirely once its intensity reaches 0", () => {
    const { ctx: baseCtx, calls: baseCalls } = createMockContext();
    renderRouteVizFrame(baseCtx, edges, layout, legControls, emptyFrame());

    const { ctx, calls } = createMockContext();
    renderRouteVizFrame(
      ctx,
      edges,
      layout,
      legControls,
      emptyFrame({
        screenFlash: { color: "#ffffff", intensity: 0, centerNodeId: "c" },
      }),
    );

    expect(calls).toEqual(baseCalls);
  });
});

describe("muted graph styles", () => {
  it("preserves existing default video graph style", () => {
    const { ctx, calls } = createMockContext();
    drawMutedGraph(ctx, edges, layout);
    expect(ctx.lineWidth).toBe(1.8);
    expect(ctx.fillStyle).toBe("#6fa3d8");
    expect(calls).toContain("arc(10,10,3.2,0,6.283185307179586)");
  });

  it("supports subtle route-builder graph styling without changing geometry", () => {
    const { ctx, calls } = createMockContext();
    const fills: number[] = [];
    ctx.fill = () => fills.push(ctx.globalAlpha);
    drawMutedGraph(ctx, edges, layout, {
      nodeRadius: 1.5,
      edgeWidth: 0.75,
      nodeColor: "#00BFFF",
      edgeColor: "#00BFFF",
      edgeOpacity: 0.3,
      nodeOpacity: 0.5,
    });
    expect(ctx.lineWidth).toBe(0.75);
    expect(ctx.fillStyle).toBe("#00BFFF");
    expect(calls).toContain("arc(10,10,1.5,0,6.283185307179586)");
    expect(calls).toContain("lineTo(90,10)");
    expect(fills).toEqual([0.5, 0.5, 0.5]);
    expect(ctx.globalAlpha).toBe(1);
  });
});
