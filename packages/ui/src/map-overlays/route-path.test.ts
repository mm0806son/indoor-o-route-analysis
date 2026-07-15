import { describe, it, expect } from "vitest";
import {
  buildRoutePathSegments,
  computeRoutePathLength,
  computeRouteArrowPositions,
  renderRoutePolylines,
  renderRouteArrows,
  renderRouteMarker,
  renderRouteMarkers,
  lightenColor,
} from "./route-path";
import { renderToDom } from "./test-utils";

const points: Record<string, { x: number; y: number }> = {
  a: { x: 0, y: 0 },
  b: { x: 100, y: 0 },
  c: { x: 100, y: 100 },
  d: { x: 200, y: 100 },
};

const findPointPx = (id: string) => points[id] ?? null;

describe("buildRoutePathSegments", () => {
  it("keeps a simple path as a single segment", () => {
    const segments = buildRoutePathSegments(["a", "b", "c"], findPointPx, () => false);
    expect(segments).toHaveLength(1);
    expect(segments[0].points).toEqual([points.a, points.b, points.c]);
    expect(segments[0].isMapSegmentTransition).toBe(false);
  });

  it("splits into transition/non-transition segments around an ignoreLength edge", () => {
    const isIgnoreLengthEdge = (from: string, to: string) => from === "b" && to === "c";
    const segments = buildRoutePathSegments(["a", "b", "c", "d"], findPointPx, isIgnoreLengthEdge);
    expect(segments.map((s) => s.isMapSegmentTransition)).toEqual([false, true, false]);
    expect(segments[0].points).toEqual([points.a, points.b]);
    expect(segments[1].points).toEqual([points.b, points.c]);
    expect(segments[2].points).toEqual([points.c, points.d]);
  });

  it("skips node ids that have no known pixel position", () => {
    const segments = buildRoutePathSegments(["a", "missing", "b"], findPointPx, () => false);
    expect(segments).toHaveLength(1);
    expect(segments[0].points).toEqual([points.a, points.b]);
  });
});

describe("computeRoutePathLength", () => {
  it("sums only the non-transition segment lengths", () => {
    const segments = buildRoutePathSegments(
      ["a", "b", "c", "d"],
      findPointPx,
      (from, to) => from === "b" && to === "c",
    );
    const { totalLength, segmentLengths } = computeRoutePathLength(segments);
    // a->b = 100, b->c = transition (0), c->d = 100
    expect(totalLength).toBeCloseTo(200);
    expect(segmentLengths).toEqual([100, 0, 100]);
  });
});

describe("computeRouteArrowPositions", () => {
  it("places arrows evenly spaced along a straight segment", () => {
    const segments = buildRoutePathSegments(["a", "b"], findPointPx, () => false);
    const { totalLength, segmentLengths } = computeRoutePathLength(segments);
    const arrows = computeRouteArrowPositions(segments, segmentLengths, totalLength, 25);
    expect(arrows).toHaveLength(4); // 100 / 25
    expect(arrows[0].dist).toBeCloseTo(25);
    expect(arrows[0].x).toBeCloseTo(25);
    expect(arrows[0].angle).toBeCloseTo(0);
  });

  it("returns no arrows when the path is shorter than the spacing", () => {
    const segments = buildRoutePathSegments(["a", "b"], findPointPx, () => false);
    const { totalLength, segmentLengths } = computeRoutePathLength(segments);
    expect(computeRouteArrowPositions(segments, segmentLengths, totalLength, 1000)).toHaveLength(0);
  });
});

describe("renderRoutePolylines", () => {
  it("renders one polyline per non-transition segment", () => {
    const segments = buildRoutePathSegments(
      ["a", "b", "c", "d"],
      findPointPx,
      (from, to) => from === "b" && to === "c",
    );
    const dom = renderToDom(renderRoutePolylines(segments, { color: "#FF0054", strokeWidth: 10 }));
    const polylines = dom.querySelectorAll("polyline");
    expect(polylines.length).toBe(2); // transition segment is skipped
    expect(polylines[0].getAttribute("stroke")).toBe("#FF0054");
  });

  it("cuts the polyline off at revealedLength for partial playback rendering", () => {
    const segments = buildRoutePathSegments(["a", "b"], findPointPx, () => false); // length 100
    const dom = renderToDom(renderRoutePolylines(segments, { color: "#000", strokeWidth: 2, revealedLength: 40 }));
    const polyline = dom.querySelector("polyline")!;
    const lastPoint = polyline.getAttribute("points")!.trim().split(" ").pop()!;
    const [x] = lastPoint.split(",").map(Number);
    expect(x).toBeCloseTo(40);
  });

  it("renders nothing once revealedLength is exhausted by an earlier segment", () => {
    const segments = buildRoutePathSegments(["a", "b", "d"], findPointPx, () => false);
    const dom = renderToDom(renderRoutePolylines(segments, { color: "#000", strokeWidth: 2, revealedLength: 50 }));
    expect(dom.querySelectorAll("polyline").length).toBe(1);
  });
});

describe("renderRouteArrows", () => {
  it("renders one polygon arrowhead per position", () => {
    const dom = renderToDom(
      renderRouteArrows([{ x: 10, y: 0, angle: 0, dist: 25 }], { color: "#fff", lineThickness: 5 }),
    );
    expect(dom.querySelectorAll("polygon").length).toBe(1);
  });

  it("hides arrows beyond revealedLength", () => {
    const dom = renderToDom(
      renderRouteArrows(
        [
          { x: 10, y: 0, angle: 0, dist: 25 },
          { x: 60, y: 0, angle: 0, dist: 75 },
        ],
        { color: "#fff", lineThickness: 5, revealedLength: 50 },
      ),
    );
    expect(dom.querySelectorAll("polygon").length).toBe(1);
  });
});

describe("lightenColor", () => {
  it("moves each channel towards white by the given fraction", () => {
    expect(lightenColor("#000000", 0.5)).toBe("#7f7f7f");
    expect(lightenColor("#000000", 1)).toBe("#ffffff");
    expect(lightenColor("#ff0000", 0)).toBe("#ff0000");
  });
});

describe("renderRouteMarker / renderRouteMarkers", () => {
  it("renders a white-filled circle outlined in the route color", () => {
    const dom = renderToDom(renderRouteMarker({ x: 5, y: 5 }, "m1", { type: "decision", color: "#8338EC" }));
    const circle = dom.querySelector("circle")!;
    expect(circle.getAttribute("fill")).toBe("white");
    expect(circle.getAttribute("stroke")).toBe("#8338EC");
  });

  it("renders one marker group per node", () => {
    const dom = renderToDom(
      renderRouteMarkers(
        [
          { nodeId: "n1", node: { x: 0, y: 0 } },
          { nodeId: "n2", node: { x: 10, y: 10 } },
        ],
        { type: "branching", color: "#3A86FF" },
      ),
    );
    expect(dom.querySelectorAll("circle").length).toBe(2);
  });
});
