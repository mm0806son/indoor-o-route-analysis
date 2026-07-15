import { describe, it, expect } from "vitest";
import { CONTROL_RADIUS, COURSE_COLOR } from "@indoor-o-route-analysis/core";
import { renderLegConnections } from "./leg-connections";
import { renderToDom } from "./test-utils";

const controls = [
  { id: "S", x: 0, y: 0 },
  { id: "31", x: 100, y: 0 },
  { id: "F", x: 200, y: 0 },
];

describe("renderLegConnections", () => {
  it("renders one line per consecutive control pair when no leg is highlighted", () => {
    const dom = renderToDom(renderLegConnections({ controls }));
    const lines = dom.querySelectorAll("line");
    expect(lines.length).toBe(2);
    // Shortened by CONTROL_RADIUS at each end (route-analysis/graph-editor use the same ControlRenderer radius).
    expect(Number(lines[0].getAttribute("x1"))).toBeCloseTo(CONTROL_RADIUS);
    expect(Number(lines[0].getAttribute("x2"))).toBeCloseTo(100 - CONTROL_RADIUS);
    expect(lines[0].getAttribute("stroke")).toBe(COURSE_COLOR);
  });

  it("renders only the highlighted leg when highlightedLegIndex is set", () => {
    const dom = renderToDom(renderLegConnections({ controls, highlightedLegIndex: 1 }));
    const lines = dom.querySelectorAll("line");
    expect(lines.length).toBe(1);
    expect(Number(lines[0].getAttribute("x1"))).toBeCloseTo(100 + CONTROL_RADIUS);
  });

  it("draws the highlighted leg thicker and with the halo filter applied", () => {
    const dom = renderToDom(
      renderLegConnections({ controls, highlightedLegIndex: 0, width: 2, highlightedWidth: 4, highlightFilter: "url(#white-halo-route)" }),
    );
    const line = dom.querySelector("line")!;
    expect(line.getAttribute("stroke-width")).toBe("4");
    expect(line.getAttribute("filter")).toBe("url(#white-halo-route)");
  });

  it("returns no lines for a single-control course", () => {
    const dom = renderToDom(renderLegConnections({ controls: [controls[0]] }));
    expect(dom.querySelectorAll("line").length).toBe(0);
  });
});
