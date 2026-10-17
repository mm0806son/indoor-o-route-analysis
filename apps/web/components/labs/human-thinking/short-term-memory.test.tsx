import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HumanRouteFrame } from "@indoor-o-route-analysis/core";
import { ShortTermMemory } from "./short-term-memory";

const frame: HumanRouteFrame = {
  index: 1, kind: "exploration", visitedByTracking: [], visitedByBacktracking: [],
  memory: {
    forwardChain: ["A"], backwardChain: ["Y"], forwardPath: [], backwardPath: [],
    forwardPending: [{ cluster: "other", label: "B" }], backwardPending: [],
  },
};
describe("ShortTermMemory", () => {
  it("shows committed chains and untried branches while exploring", () => {
    const html = renderToStaticMarkup(<ShortTermMemory frame={frame} />);
    expect(html).toContain("Short-term memory");
    expect(html).toContain(">A<");
    expect(html).toContain(">Y<");
    expect(html).toContain("Still to try: B");
  });
  it.each(["closure", "same-floor", "same-floor-check", "meeting-rejected", "no-route"] as const)("hides working memory in %s, even with a legacy memory payload", kind => {
    expect(renderToStaticMarkup(<ShortTermMemory frame={{ ...frame, kind }} />)).toBe("");
  });
  it("renders nothing before a trace exists", () => {
    expect(renderToStaticMarkup(<ShortTermMemory />)).toBe("");
  });
});
