import { describe, it, expect } from "vitest";
import type { Edge } from "@indoor-o-route-analysis/core";
import { GRAPH_DEAD_END_COLOR, GRAPH_EDGE_COLOR } from "@indoor-o-route-analysis/core";
import { renderGraphOverlay } from "./graph-overlay";
import { renderToDom } from "./test-utils";

const nodes = [
  { id: "n1", x: 0, y: 0 },
  { id: "n2", x: 100, y: 0 },
];
const controls = [{ id: "c1", x: 50, y: 50 }];
const edges: Edge[] = [{ from: "n1", to: "n2" } as Edge];

describe("renderGraphOverlay", () => {
  it("renders nothing when neither showEdges nor showNodes is set", () => {
    const dom = renderToDom(renderGraphOverlay({ edges, nodes, controls }));
    expect(dom.querySelectorAll("line, circle").length).toBe(0);
  });

  it("renders an edge line and vertex dots when both are shown", () => {
    const dom = renderToDom(renderGraphOverlay({ edges, nodes, controls, showEdges: true, showNodes: true }));
    expect(dom.querySelectorAll("line").length).toBe(1);
    // 2 nodes + 1 control
    expect(dom.querySelectorAll("circle").length).toBe(3);
  });

  it("hides ignoreLength edges even when showEdges is true", () => {
    const ignoreEdges: Edge[] = [{ from: "n1", to: "n2", ignoreLength: true } as Edge];
    const dom = renderToDom(renderGraphOverlay({ edges: ignoreEdges, nodes, controls, showEdges: true }));
    expect(dom.querySelectorAll("line").length).toBe(0);
  });

  it("shows vertices when only showNodes is set, without drawing edges", () => {
    const dom = renderToDom(renderGraphOverlay({ edges, nodes, controls, showNodes: true }));
    expect(dom.querySelectorAll("line").length).toBe(0);
    expect(dom.querySelectorAll("circle").length).toBe(3);
  });

  it("colors a dead-end edge differently from a normal edge", () => {
    const dom = renderToDom(
      renderGraphOverlay({
        edges,
        nodes,
        controls,
        showEdges: true,
        deadEndEdgeKeys: new Set(["n1->n2"]),
      }),
    );
    const line = dom.querySelector("line")!;
    expect(line.getAttribute("stroke")).toBe(GRAPH_DEAD_END_COLOR);
  });

  it("uses the normal edge color when the edge is not a dead end", () => {
    const dom = renderToDom(renderGraphOverlay({ edges, nodes, controls, showEdges: true }));
    const line = dom.querySelector("line")!;
    expect(line.getAttribute("stroke")).toBe(GRAPH_EDGE_COLOR);
  });

  it("thickens and fully opacifies the selected edge", () => {
    const dom = renderToDom(
      renderGraphOverlay({ edges, nodes, controls, showEdges: true, selectedEdgeKey: "n1->n2" }),
    );
    const line = dom.querySelector("line")!;
    expect(line.getAttribute("opacity")).toBe("1");
  });
});
