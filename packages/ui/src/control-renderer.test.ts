import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Control } from "@indoor-o-route-analysis/core";
import {
  CONTROL_RADIUS,
  FINISH_INNER_CIRCLE_RADIUS,
  COURSE_COLOR,
  SELECTED_COURSE_COLOR,
  AVAILABLE_COLOR,
} from "@indoor-o-route-analysis/core";
import { ControlRenderer } from "./control-renderer";

/** Renders a ReactNode to a DOM subtree so tests can query it structurally. */
function renderToDom(node: React.ReactNode): HTMLElement {
  const markup = renderToStaticMarkup(createElement("svg", null, node));
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

function makeControl(overrides: Partial<Control & { x: number; y: number }> = {}): Control & { x: number; y: number } {
  return {
    id: "31",
    type: "control",
    mapPosition: { x: 0, y: 0 },
    x: 100,
    y: 200,
    ...overrides,
  } as Control & { x: number; y: number };
}

describe("ControlRenderer.getLegCoordinates", () => {
  it("shortens a horizontal leg by CONTROL_RADIUS at each end", () => {
    const coords = ControlRenderer.getLegCoordinates({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(coords.x1).toBeCloseTo(CONTROL_RADIUS);
    expect(coords.y1).toBeCloseTo(0);
    expect(coords.x2).toBeCloseTo(100 - CONTROL_RADIUS);
    expect(coords.y2).toBeCloseTo(0);
  });

  it("returns the original points for a zero-length leg", () => {
    const coords = ControlRenderer.getLegCoordinates({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(coords).toEqual({ x1: 5, y1: 5, x2: 5, y2: 5 });
  });
});

describe("ControlRenderer.renderLeg", () => {
  it("renders a single line shortened at both ends", () => {
    const dom = renderToDom(ControlRenderer.renderLeg({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }));
    const line = dom.querySelector("line");
    expect(line).not.toBeNull();
    expect(Number(line!.getAttribute("x1"))).toBeCloseTo(CONTROL_RADIUS);
    expect(Number(line!.getAttribute("x2"))).toBeCloseTo(100 - CONTROL_RADIUS);
    expect(line!.getAttribute("stroke")).toBe(COURSE_COLOR);
  });

  it("uses the provided color and width", () => {
    const dom = renderToDom(
      ControlRenderer.renderLeg({ from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, color: "#123456", width: 5 }),
    );
    const line = dom.querySelector("line")!;
    expect(line.getAttribute("stroke")).toBe("#123456");
    expect(line.getAttribute("stroke-width")).toBe("5");
  });
});

describe("ControlRenderer.renderControl", () => {
  it("renders a start control as a triangle (polygon)", () => {
    const control = makeControl({ type: "start" });
    const dom = renderToDom(
      ControlRenderer.renderControl({ control, courseControls: [control], courseControlCodes: ["31"] }),
    );
    expect(dom.querySelector("polygon")).not.toBeNull();
    expect(dom.querySelector("circle")).toBeNull();
  });

  it("renders a finish control as two concentric circles", () => {
    const control = makeControl({ id: "F", type: "finish" });
    const dom = renderToDom(
      ControlRenderer.renderControl({ control, courseControls: [control], courseControlCodes: ["F"] }),
    );
    const circles = dom.querySelectorAll("circle");
    expect(circles.length).toBe(2);
    const radii = Array.from(circles).map((c) => Number(c.getAttribute("r"))).sort((a, b) => a - b);
    expect(radii[0]).toBeCloseTo(FINISH_INNER_CIRCLE_RADIUS);
    expect(radii[1]).toBeCloseTo(CONTROL_RADIUS);
  });

  it("renders a regular in-course control with its position label", () => {
    const start = makeControl({ id: "S", type: "start", x: 0, y: 0 });
    const control = makeControl({ id: "31", type: "control", x: 100, y: 0 });
    const courseControls = [start, control];
    const dom = renderToDom(
      ControlRenderer.renderControl({
        control,
        courseControls,
        courseControlCodes: ["S", "31"],
      }),
    );
    expect(dom.querySelector("circle")).not.toBeNull();
    expect(dom.querySelector("text")?.textContent).toBe("1");
  });

  it("shows the control code instead of a position label when not in the course", () => {
    const control = makeControl({ id: "99", type: "control" });
    const dom = renderToDom(
      ControlRenderer.renderControl({ control, courseControls: [], courseControlCodes: [] }),
    );
    expect(dom.querySelector("text")?.textContent).toBe("99");
  });

  it("uses the selected color and heavier stroke when isSelected is true", () => {
    const control = makeControl();
    const dom = renderToDom(
      ControlRenderer.renderControl({
        control,
        courseControls: [control],
        courseControlCodes: ["31"],
        isSelected: true,
      }),
    );
    const circle = dom.querySelector("circle")!;
    expect(circle.getAttribute("stroke")).toBe(SELECTED_COURSE_COLOR);
  });

  it("falls back to the available-control color for out-of-course controls", () => {
    const control = makeControl({ id: "42" });
    const dom = renderToDom(
      ControlRenderer.renderControl({ control, courseControls: [], courseControlCodes: [] }),
    );
    const circle = dom.querySelector("circle")!;
    expect(circle.getAttribute("stroke")).toBe(AVAILABLE_COLOR);
  });

  it("draws a control-point dot only when showControlPoint is true", () => {
    const control = makeControl();
    const without = renderToDom(
      ControlRenderer.renderControl({ control, courseControls: [control], courseControlCodes: ["31"] }),
    );
    expect(without.querySelectorAll("circle").length).toBe(1);

    const withDot = renderToDom(
      ControlRenderer.renderControl({
        control,
        courseControls: [control],
        courseControlCodes: ["31"],
        showControlPoint: true,
      }),
    );
    expect(withDot.querySelectorAll("circle").length).toBe(2);
  });
});
