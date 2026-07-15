import { describe, it, expect } from "vitest";
import { HALO_FILTER_IDS, renderHaloFilterDefs } from "./halo-filters";
import { renderToDom } from "./test-utils";

describe("renderHaloFilterDefs", () => {
  it("renders one <filter> per requested id, with a matching id attribute", () => {
    const dom = renderToDom(renderHaloFilterDefs([HALO_FILTER_IDS.whiteRoute, HALO_FILTER_IDS.orangeNode]));
    const filters = dom.querySelectorAll("filter");
    expect(filters.length).toBe(2);
    expect(Array.from(filters).map((f) => f.id)).toEqual([HALO_FILTER_IDS.whiteRoute, HALO_FILTER_IDS.orangeNode]);
  });

  it("renders nothing when given an empty list", () => {
    const dom = renderToDom(renderHaloFilterDefs([]));
    expect(dom.querySelectorAll("filter").length).toBe(0);
  });

  it("uses the orange flood color for orange halo filters and white for white halo filters", () => {
    const dom = renderToDom(renderHaloFilterDefs([HALO_FILTER_IDS.whiteNode, HALO_FILTER_IDS.orangeEdge]));
    const floods = dom.querySelectorAll("feFlood");
    const colors = Array.from(floods).map((f) => f.getAttribute("flood-color"));
    expect(colors).toContain("white");
    expect(colors).toContain("#ff6600");
  });

  it("gives every requested filter a complete blur/flood/composite/merge pipeline", () => {
    const dom = renderToDom(renderHaloFilterDefs([HALO_FILTER_IDS.whiteEdge]));
    const filter = dom.querySelector("filter")!;
    expect(filter.querySelectorAll("feGaussianBlur").length).toBe(2);
    expect(filter.querySelectorAll("feFlood").length).toBe(2);
    expect(filter.querySelectorAll("feComposite").length).toBe(2);
    expect(filter.querySelector("feMerge")).not.toBeNull();
  });
});
