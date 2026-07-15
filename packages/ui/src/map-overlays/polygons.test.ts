import { describe, it, expect } from "vitest";
import type { Polygon } from "@indoor-o-route-analysis/core";
import { POLYGON_FILL_COLOR_DEFAULT, POLYGON_FILL_COLOR_SELECTED } from "@indoor-o-route-analysis/core";
import { getPolygonCentroid, buildPolygonPathData, renderPolygonOutline } from "./polygons";
import { renderToDom } from "./test-utils";

const identity = (p: { x: number; y: number }) => p;

const square: Polygon = {
  id: "p1",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  level: 2,
};

describe("getPolygonCentroid", () => {
  it("averages the vertices", () => {
    expect(getPolygonCentroid(square.points)).toEqual({ x: 5, y: 5 });
  });

  it("returns the origin for an empty point list", () => {
    expect(getPolygonCentroid([])).toEqual({ x: 0, y: 0 });
  });
});

describe("buildPolygonPathData", () => {
  it("builds a closed M...L...Z path through the (pixel-transformed) points", () => {
    const d = buildPolygonPathData(square, identity);
    expect(d).toBe("M 0,0 L 10,0 L 10,10 L 0,10 Z");
  });

  it("appends one M...Z subpath per hole", () => {
    const withHole: Polygon = {
      ...square,
      holes: [
        [
          { x: 2, y: 2 },
          { x: 4, y: 2 },
          { x: 4, y: 4 },
        ],
      ],
    };
    const d = buildPolygonPathData(withHole, identity);
    expect(d).toBe("M 0,0 L 10,0 L 10,10 L 0,10 Z M 2,2 L 4,2 L 4,4 Z");
  });

  it("applies the toPixels transform to every point", () => {
    const d = buildPolygonPathData(square, (p) => ({ x: p.x * 2, y: p.y * 2 }));
    expect(d).toBe("M 0,0 L 20,0 L 20,20 L 0,20 Z");
  });
});

describe("renderPolygonOutline", () => {
  it("renders a filled/stroked path using the default (unselected) colors", () => {
    const dom = renderToDom(renderPolygonOutline({ polygon: square, toPixels: identity }));
    const path = dom.querySelector("path")!;
    expect(path.getAttribute("fill")).toBe(POLYGON_FILL_COLOR_DEFAULT);
    expect(path.getAttribute("fill-rule")).toBe("evenodd");
  });

  it("switches to the selected colors when isSelected is true", () => {
    const dom = renderToDom(renderPolygonOutline({ polygon: square, toPixels: identity, isSelected: true }));
    const path = dom.querySelector("path")!;
    expect(path.getAttribute("fill")).toBe(POLYGON_FILL_COLOR_SELECTED);
  });

  it("omits the level label by default", () => {
    const dom = renderToDom(renderPolygonOutline({ polygon: square, toPixels: identity }));
    expect(dom.querySelector("text")).toBeNull();
  });

  it("draws the level number at the centroid when showLevelLabel is true", () => {
    const dom = renderToDom(renderPolygonOutline({ polygon: square, toPixels: identity, showLevelLabel: true }));
    const text = dom.querySelector("text")!;
    expect(text.textContent).toBe("2");
    expect(text.getAttribute("x")).toBe("5");
    expect(text.getAttribute("y")).toBe("5");
  });
});
