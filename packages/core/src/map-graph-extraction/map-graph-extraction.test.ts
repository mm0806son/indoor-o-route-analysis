import { describe, expect, it } from "vitest";

import { attachControls } from "./attach-controls";
import { buildFreeSpace, splitIntoPanels } from "./free-space";
import { classifyPixels, maskForRoles } from "./palette";
import { closing, connectedComponents, countMask, createMask, removeSmallHoles, removeSmallObjects } from "./morphology";
import { neighbourDegrees, skeletonize } from "./skeleton";
import {
  materializeChainNodes,
  mergeNearbyNodes,
  pruneShortDeadEnds,
  simplifyPolyline,
} from "./simplify";
import { snapPointToGraph } from "./snap";
import { attachStair, distanceToGraph, findStairBlobs, stairAbutsPanel, type StairBlob } from "./stairs";
import { createIdAllocator, createPixelToEvent, tracedGraphToEvent } from "./to-event";
import { traceSkeleton } from "./trace";
import type { Control } from "../models/control";
import type { MapData } from "../models/map";
import type { BitMask, PaletteEntry, RasterImage, TracedGraph } from "./types";

/** Builds a RasterImage from rows of single-character colour keys. */
function imageFrom(rows: string[], colours: Record<string, [number, number, number]>): RasterImage {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);

  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const [r, g, b] = colours[ch];
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    });
  });

  return { width, height, data };
}

/** Builds a BitMask from rows of "." (unset) and "#" (set). */
function maskFrom(rows: string[]): BitMask {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      data[y * width + x] = ch === "#" ? 1 : 0;
    });
  });
  return { width, height, data };
}

const PALETTE: PaletteEntry[] = [
  { name: "floor", rgb: [250, 227, 199], role: "passable" },
  { name: "building", rgb: [148, 148, 148], role: "blocked" },
  { name: "table", rgb: [161, 255, 135], role: "furniture" },
  { name: "stair-red", rgb: [239, 47, 44], role: "stairs", stairVariant: "red" },
  { name: "stair-blue", rgb: [0, 204, 255], role: "stairs", stairVariant: "blue" },
  { name: "white", rgb: [255, 255, 255], role: "outside" },
];

const OPTIONS = { deltaEAccept: 20, deltaEMarginAccept: 30, deltaEMarginRatio: 0.6 };

describe("classifyPixels", () => {
  it("assigns roles to exact palette colours", () => {
    const image = imageFrom(["fbw"], {
      f: [250, 227, 199],
      b: [148, 148, 148],
      w: [255, 255, 255],
    });
    const { classMap, entryMap } = classifyPixels(image, PALETTE, OPTIONS);
    const mask = maskForRoles(classMap, 3, 1, ["passable"]);

    expect([...mask.data]).toEqual([1, 0, 0]);
    expect(PALETTE[entryMap[0]].name).toBe("floor");
  });

  it("rejects a colour beyond the outer threshold", () => {
    // A blue floor-panel frame: every palette entry is far away, so it must not
    // be forced into the nearest role and become a solid wall.
    const image = imageFrom(["x"], { x: [86, 140, 209] });
    const { classMap } = classifyPixels(image, PALETTE, OPTIONS);

    expect(maskForRoles(classMap, 1, 1, ["blocked"]).data[0]).toBe(0);
    expect(maskForRoles(classMap, 1, 1, ["unknown"]).data[0]).toBe(1);
  });

  it("rejects inside the margin band when no entry stands out", () => {
    // Midway between two greys ~48 ΔE apart, so the nearest is ~24 away - inside
    // the 20-30 margin band - with the runner-up almost equally close. This is
    // the branch the outer-threshold test above never reaches.
    const ambiguous: PaletteEntry[] = [
      { name: "dark", rgb: [60, 60, 60], role: "passable" },
      { name: "light", rgb: [180, 180, 180], role: "blocked" },
    ];
    const image = imageFrom(["x"], { x: [118, 118, 118] });
    const { classMap } = classifyPixels(image, ambiguous, OPTIONS);

    expect(maskForRoles(classMap, 1, 1, ["unknown"]).data[0]).toBe(1);
  });

  it("accepts inside the margin band when one entry clearly wins", () => {
    const ambiguous: PaletteEntry[] = [
      { name: "dark", rgb: [60, 60, 60], role: "passable" },
      { name: "light", rgb: [240, 240, 240], role: "blocked" },
    ];
    // ~23 ΔE from "dark" and ~50 from "light": a clear enough margin to accept.
    const image = imageFrom(["x"], { x: [115, 115, 115] });
    const { classMap } = classifyPixels(image, ambiguous, OPTIONS);

    expect(maskForRoles(classMap, 1, 1, ["passable"]).data[0]).toBe(1);
  });

  it("accepts a tint of a palette ink when it clearly beats the runner-up", () => {
    // An apricot floor tint: further than deltaEAccept from "floor" but much
    // closer to it than to anything else.
    const image = imageFrom(["x"], { x: [252, 216, 145] });
    const { classMap } = classifyPixels(image, PALETTE, OPTIONS);

    expect(maskForRoles(classMap, 1, 1, ["passable"]).data[0]).toBe(1);
  });

  it("reports the dominant unmatched colours", () => {
    const image = imageFrom(["xxf"], { x: [86, 140, 209], f: [250, 227, 199] });
    const { unmatched } = classifyPixels(image, PALETTE, OPTIONS);

    expect(unmatched[0].rgb).toEqual([86, 140, 209]);
    expect(unmatched[0].fraction).toBeCloseTo(2 / 3);
  });
});

describe("morphology", () => {
  it("closes a gap narrower than twice the radius", () => {
    const mask = maskFrom(["#####.#####"]);
    expect(countMask(closing(mask, 1))).toBe(11);
  });

  it("leaves a gap wider than twice the radius open", () => {
    const mask = maskFrom(["####.....####"]);
    expect(countMask(closing(mask, 1))).toBe(8);
  });

  it("fills enclosed holes but not the outside", () => {
    const mask = maskFrom(["#####", "#...#", "#####"]);
    const filled = removeSmallHoles(mask, 10);
    expect(countMask(filled)).toBe(15);
  });

  it("does not fill a region connected to the border", () => {
    const mask = maskFrom(["#####", "#...#", "##.##"]);
    expect(countMask(removeSmallHoles(mask, 10))).toBe(countMask(mask));
  });

  it("drops components below the size threshold", () => {
    const mask = maskFrom(["##..#", "##...", "....."]);
    expect(countMask(removeSmallObjects(mask, 2))).toBe(4);
  });

  it("uses 4-connectivity so diagonal touches stay separate", () => {
    const mask = maskFrom(["#.", ".#"]);
    expect(connectedComponents(mask).count).toBe(2);
  });
});

describe("free space", () => {
  it("merges furniture into room space and excludes overprint", () => {
    const image = imageFrom(["fff", "ftf", "fff"], {
      f: [250, 227, 199],
      t: [161, 255, 135],
    });
    const { classMap, width, height } = classifyPixels(image, PALETTE, OPTIONS);
    const free = buildFreeSpace(classMap, width, height, {
      closingRadiusPx: 0,
      maxFillHoleAreaPx: 0,
      minComponentAreaPx: 1,
    });

    expect(countMask(free)).toBe(9);
  });

  it("keeps pages apart when a seam is painted", () => {
    const image = imageFrom(["ffffff"], { f: [250, 227, 199] });
    const { classMap, width, height } = classifyPixels(image, PALETTE, OPTIONS);
    const free = buildFreeSpace(classMap, width, height, {
      closingRadiusPx: 1,
      maxFillHoleAreaPx: 0,
      minComponentAreaPx: 1,
      seams: { axis: "x", offsets: [3] },
    });

    expect(splitIntoPanels(free, 1)).toHaveLength(2);
  });
});

describe("skeletonize and trace", () => {
  const plus = maskFrom([
    ".....###.....",
    ".....###.....",
    ".....###.....",
    "#############",
    "#############",
    "#############",
    ".....###.....",
    ".....###.....",
    ".....###.....",
  ]);

  it("thins a plus to a one-pixel cross", () => {
    const skeleton = skeletonize(plus);
    const degrees = neighbourDegrees(skeleton);
    let junctions = 0;
    for (let i = 0; i < skeleton.data.length; i++) {
      if (skeleton.data[i] && degrees[i] >= 3) junctions++;
    }
    expect(junctions).toBeGreaterThan(0);
    expect(countMask(skeleton)).toBeLessThan(countMask(plus) / 2);
  });

  it("keeps a thin structure intact rather than eroding it", () => {
    const line = maskFrom(["##########"]);
    expect(countMask(skeletonize(line))).toBe(10);
  });

  it("traces a cross into one junction node referenced by four edges", () => {
    const graph = traceSkeleton(skeletonize(plus), 0, 0);
    const merged = mergeNearbyNodes(graph, 2);

    const junctions = merged.nodes.filter((n) => n.kind === "junction");
    expect(junctions).toHaveLength(1);

    const deadEnds = merged.nodes.filter((n) => n.kind === "dead-end");
    expect(deadEnds).toHaveLength(4);

    const junctionId = junctions[0].id;
    const incident = merged.edges.filter((e) => e.a === junctionId || e.b === junctionId);
    expect(incident).toHaveLength(4);
  });

});

describe("pruneShortDeadEnds", () => {
  /** A junction with two long arms and one stub of the given length. */
  function star(stubLength: number): TracedGraph {
    return {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "junction" },
        { id: 1, px: -50, py: 0, kind: "dead-end" },
        { id: 2, px: 50, py: 0, kind: "dead-end" },
        { id: 3, px: 0, py: stubLength, kind: "dead-end" },
      ],
      edges: [
        { a: 0, b: 1, polyline: [] },
        { a: 0, b: 2, polyline: [] },
        { a: 0, b: 3, polyline: [] },
      ],
    };
  }

  it("removes a stub shorter than the threshold", () => {
    const pruned = pruneShortDeadEnds(star(2), 10);
    expect(pruned.edges).toHaveLength(2);
    expect(pruned.nodes).toHaveLength(3);
  });

  it("keeps a dead-end branch longer than the threshold", () => {
    // Regression: pixel-space pruning trimmed every branch by the threshold from
    // both ends, so a real dead-end corridor lost 3 m at each end.
    const pruned = pruneShortDeadEnds(star(40), 10);
    expect(pruned.edges).toHaveLength(3);
  });

  it("keeps a short corridor that is loose at both ends", () => {
    const isolated: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "dead-end" },
        { id: 1, px: 3, py: 0, kind: "dead-end" },
      ],
      edges: [{ a: 0, b: 1, polyline: [] }],
    };
    expect(pruneShortDeadEnds(isolated, 10).edges).toHaveLength(1);
  });

  it("never prunes a branch that ends at a control", () => {
    const graph = star(2);
    graph.nodes[3] = { id: 3, px: 0, py: 2, kind: "control", controlId: "31" };
    expect(pruneShortDeadEnds(graph, 10).edges).toHaveLength(3);
  });

  it("cascades when removing a stub exposes another", () => {
    const chain: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "junction" },
        { id: 1, px: -50, py: 0, kind: "dead-end" },
        { id: 2, px: 50, py: 0, kind: "dead-end" },
        { id: 3, px: 0, py: 2, kind: "junction" },
        { id: 4, px: 0, py: 4, kind: "dead-end" },
      ],
      edges: [
        { a: 0, b: 1, polyline: [] },
        { a: 0, b: 2, polyline: [] },
        { a: 0, b: 3, polyline: [] },
        { a: 3, b: 4, polyline: [] },
      ],
    };
    expect(pruneShortDeadEnds(chain, 10).edges).toHaveLength(2);
  });
});

describe("simplify", () => {
  it("collapses a collinear chain to its endpoints", () => {
    const points = [
      { px: 0, py: 0 },
      { px: 1, py: 0 },
      { px: 2, py: 0 },
      { px: 3, py: 0 },
    ];
    expect(simplifyPolyline(points, 0.1)).toHaveLength(2);
  });

  it("keeps a corner that exceeds the tolerance", () => {
    const points = [
      { px: 0, py: 0 },
      { px: 2, py: 3 },
      { px: 4, py: 0 },
    ];
    expect(simplifyPolyline(points, 0.5)).toHaveLength(3);
  });

  it("merges junctions but never absorbs a control", () => {
    const graph: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "junction" },
        { id: 1, px: 1, py: 0, kind: "junction" },
        { id: 2, px: 1, py: 1, kind: "control", controlId: "31" },
        { id: 3, px: 10, py: 0, kind: "dead-end" },
      ],
      edges: [
        { a: 0, b: 1, polyline: [] },
        { a: 1, b: 2, polyline: [] },
        { a: 1, b: 3, polyline: [] },
      ],
    };

    const merged = mergeNearbyNodes(graph, 2);
    expect(merged.nodes.filter((n) => n.kind === "junction")).toHaveLength(1);

    const control = merged.nodes.find((n) => n.controlId === "31");
    expect(control).toBeDefined();
    expect(control?.px).toBe(1);
    expect(control?.py).toBe(1);
  });

  it("subdivides an edge longer than the target spacing", () => {
    const graph: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "dead-end" },
        { id: 1, px: 100, py: 0, kind: "dead-end" },
      ],
      edges: [{ a: 0, b: 1, polyline: [] }],
    };

    const chained = materializeChainNodes(graph, 10);
    expect(chained.edges).toHaveLength(10);
    expect(chained.nodes.filter((n) => n.kind === "chain")).toHaveLength(9);
  });
});

describe("attachControls", () => {
  const graph: TracedGraph = {
    pageIndex: 0,
    panelIndex: 0,
    nodes: [
      { id: 0, px: 0, py: 0, kind: "dead-end" },
      { id: 1, px: 100, py: 0, kind: "dead-end" },
    ],
    edges: [{ a: 0, b: 1, polyline: [] }],
  };

  const control = (id: string): Control => ({ id, type: "control", mapPosition: { x: 0, y: 0 } });

  it("splits the nearest edge and takes the control's id", () => {
    const result = attachControls(graph, [{ control: control("31"), px: 50, py: 2 }], {
      maxSnapDistancePx: 10,
      snapToExistingPx: 1,
    });

    expect(result.attached).toHaveLength(1);
    expect(result.graph.edges).toHaveLength(2);

    const node = result.graph.nodes.find((n) => n.controlId === "31");
    expect(node?.kind).toBe("control");
  });

  it("reports rather than guesses when the control is too far away", () => {
    const result = attachControls(graph, [{ control: control("32"), px: 50, py: 500 }], {
      maxSnapDistancePx: 10,
      snapToExistingPx: 1,
    });

    expect(result.attached).toHaveLength(0);
    expect(result.unattached[0].controlId).toBe("32");
    expect(result.unattached[0].reason).toBe("too-far");
    expect(result.graph.edges).toHaveLength(1);
  });

  it("tries farther candidates when the nearest snap has no line of sight", () => {
    // A room north of an east-west corridor (y=18), with a wall (y=10..12,
    // x=14..) between them, and a north-south corridor at x=10 the room opens
    // onto. The nearest snap for the control at (26,6) is straight through the
    // wall; the attachable point is west, on the other corridor.
    const free = maskFrom(
      Array.from({ length: 24 }, (_, y) =>
        y >= 10 && y <= 12 ? "##############..................".slice(0, 32) : "#".repeat(32),
      ),
    );
    const corridors: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 10, py: 2, kind: "dead-end" },
        { id: 1, px: 10, py: 18, kind: "junction" },
        { id: 2, px: 30, py: 18, kind: "dead-end" },
      ],
      edges: [
        { a: 0, b: 1, polyline: [] },
        { a: 1, b: 2, polyline: [] },
      ],
    };

    const result = attachControls(corridors, [{ control: control("70"), px: 26, py: 6 }], {
      maxSnapDistancePx: 20,
      snapToExistingPx: 3,
      freeSpace: free,
      wallTolerancePx: 2,
    });

    expect(result.attached).toHaveLength(1);
    const node = result.graph.nodes.find((n) => n.controlId === "70");
    expect(node?.px).toBe(10);
    expect(node?.py).toBe(6);
    expect(result.attached[0].distancePx).toBeCloseTo(16, 5);
  });

  it("falls back from a pulled node to the raw projection when the node has no sight", () => {
    // The snap lands within snapToExistingPx of junction E, but the sight-line
    // to E clips a cabinet; the raw projection two pixels west is clear. The
    // control must attach by insertion instead of being vetoed by the pull.
    const free = maskFrom(
      Array.from({ length: 14 }, (_, y) =>
        y >= 5 && y <= 9 ? "#############....#######".slice(0, 24) : "#".repeat(24),
      ),
    );
    const corridor: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 10, kind: "dead-end" },
        { id: 1, px: 14, py: 10, kind: "junction" },
      ],
      edges: [{ a: 0, b: 1, polyline: [] }],
    };

    const result = attachControls(corridor, [{ control: control("34"), px: 12, py: 4 }], {
      maxSnapDistancePx: 15,
      snapToExistingPx: 3,
      freeSpace: free,
      wallTolerancePx: 2,
    });

    expect(result.attached).toHaveLength(1);
    const node = result.graph.nodes.find((n) => n.controlId === "34");
    expect(node?.px).toBe(12);
    expect(node?.py).toBe(10);
    const junction = result.graph.nodes.find((n) => n.id === 1);
    expect(junction?.kind).toBe("junction");
  });

  it("reports no-sight rather than too-far when candidates are near but blocked", () => {
    const free = maskFrom(
      Array.from({ length: 10 }, (_, y) => (y >= 4 && y <= 6 ? ".".repeat(12) : "#".repeat(12))),
    );
    const corridor: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 8, kind: "dead-end" },
        { id: 1, px: 10, py: 8, kind: "dead-end" },
      ],
      edges: [{ a: 0, b: 1, polyline: [] }],
    };

    const result = attachControls(corridor, [{ control: control("60"), px: 5, py: 1 }], {
      maxSnapDistancePx: 10,
      snapToExistingPx: 1,
      freeSpace: free,
      wallTolerancePx: 2,
    });

    expect(result.attached).toHaveLength(0);
    expect(result.unattached[0].reason).toBe("no-sight");
    expect(result.unattached[0].distancePx).toBeCloseTo(7, 5);
  });
});

describe("snapPointToGraph candidates", () => {
  it("offers candidates in distance order to the accept callback", () => {
    const graph: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "dead-end" },
        { id: 1, px: 10, py: 0, kind: "dead-end" },
        { id: 2, px: 0, py: 20, kind: "dead-end" },
        { id: 3, px: 10, py: 20, kind: "dead-end" },
      ],
      edges: [
        { a: 0, b: 1, polyline: [] },
        { a: 2, b: 3, polyline: [] },
      ],
    };

    const nearest = snapPointToGraph(graph, { px: 5, py: 8 }, { kind: "control" }, 0);
    expect(nearest?.distancePx).toBeCloseTo(8, 5);

    const seen: number[] = [];
    const second = snapPointToGraph(graph, { px: 5, py: 8 }, { kind: "control" }, 0, {
      accept: (candidate) => {
        seen.push(candidate.py);
        return candidate.py >= 10;
      },
    });
    expect(seen).toEqual([0, 20]);
    expect(second?.distancePx).toBeCloseTo(12, 5);

    const none = snapPointToGraph(graph, { px: 5, py: 8 }, { kind: "control" }, 0, {
      accept: () => false,
    });
    expect(none).toBeUndefined();
  });

  it("stops offering candidates beyond maxDistancePx", () => {
    const graph: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "dead-end" },
        { id: 1, px: 10, py: 0, kind: "dead-end" },
        { id: 2, px: 0, py: 20, kind: "dead-end" },
        { id: 3, px: 10, py: 20, kind: "dead-end" },
      ],
      edges: [
        { a: 0, b: 1, polyline: [] },
        { a: 2, b: 3, polyline: [] },
      ],
    };

    const seen: number[] = [];
    const result = snapPointToGraph(graph, { px: 5, py: 8 }, { kind: "control" }, 0, {
      accept: (candidate) => {
        seen.push(candidate.py);
        return candidate.py >= 10;
      },
      maxDistancePx: 9,
    });
    expect(seen).toEqual([0]);
    expect(result).toBeUndefined();
  });
});

describe("createIdAllocator", () => {
  it("floors at 1000 for an event with no vertices", () => {
    expect(createIdAllocator([]).next()).toBe("1000");
  });

  it("ignores non-numeric ids but still avoids numeric ones", () => {
    const ids = createIdAllocator(["3f1b-uuid-style", "2450", "another-uuid"]);
    expect(ids.next()).toBe("2451");
  });

  it("clears numeric control ids so generated ids cannot collide", () => {
    // Control ids share the edge-endpoint namespace and reach 235 in the corpus.
    const ids = createIdAllocator(["31", "100", "235"]);
    expect(ids.next()).toBe("1000");
  });
});

describe("tracedGraphToEvent", () => {
  it("emits no vertex for a control but still references it from edges", () => {
    const graph: TracedGraph = {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "dead-end" },
        { id: 1, px: 10, py: 0, kind: "control", controlId: "31" },
      ],
      edges: [{ a: 0, b: 1, polyline: [] }],
    };

    const mapping = {
      toEvent: (px: number, py: number) => ({ x: px, y: py }),
      toPixel: (p: { x: number; y: number }) => ({ px: p.x, py: p.y }),
      metresPerPixel: 1,
    };

    const converted = tracedGraphToEvent(graph, mapping, createIdAllocator([]));
    expect(converted.vertices).toHaveLength(1);
    expect(converted.edges).toHaveLength(1);
    expect(converted.edges[0].to).toBe("31");
  });
});

describe("stairs", () => {
  const BLOB_OPTS = { minAreaPx: 1, maxAreaPx: 1e6, maxElongation: 100, mergeDistancePx: 0 };

  function panelGraph(): TracedGraph {
    return {
      pageIndex: 0,
      panelIndex: 0,
      nodes: [
        { id: 0, px: 0, py: 0, kind: "dead-end" },
        { id: 1, px: 9, py: 0, kind: "dead-end" },
      ],
      edges: [{ a: 0, b: 1, polyline: [] }],
    };
  }

  it("reads the variant from the ink that matched, not the rendered colour", () => {
    const image = imageFrom(["ffffssffff"], { f: [250, 227, 199], s: [0, 204, 255] });
    const { classMap, entryMap, width, height } = classifyPixels(image, PALETTE, OPTIONS);

    const blobs = findStairBlobs(classMap, entryMap, PALETTE, width, height, BLOB_OPTS);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].variant).toBe("blue");
    expect(blobs[0].areaPx).toBe(2);
  });

  it("attaches a stair by splitting the nearest edge", () => {
    const image = imageFrom(["ffffssffff"], { f: [250, 227, 199], s: [239, 47, 44] });
    const { classMap, entryMap, width, height } = classifyPixels(image, PALETTE, OPTIONS);
    const blob = findStairBlobs(classMap, entryMap, PALETTE, width, height, BLOB_OPTS)[0];

    const attached = attachStair(panelGraph(), blob, {
      maxAttachDistancePx: 5,
      snapToExistingPx: 0.5,
    });

    expect(attached).toBeDefined();
    expect(attached?.graph.edges).toHaveLength(2);
    expect(attached?.stair.variant).toBe("red");
  });

  it("does not attach a stair beyond the attach radius", () => {
    const blob: StairBlob = { px: 4, py: 100, areaPx: 2, variant: "red", minX: 3, maxX: 5, minY: 100, maxY: 100 };
    expect(attachStair(panelGraph(), blob, { maxAttachDistancePx: 5, snapToExistingPx: 0.5 })).toBeUndefined();
  });

  it("carries the blob's bounding box, merged across fragments", () => {
    const image = imageFrom(["ffssffssff"], { f: [250, 227, 199], s: [239, 47, 44] });
    const { classMap, entryMap, width, height } = classifyPixels(image, PALETTE, OPTIONS);

    const blobs = findStairBlobs(classMap, entryMap, PALETTE, width, height, {
      ...BLOB_OPTS,
      mergeDistancePx: 10,
    });

    expect(blobs).toHaveLength(1);
    expect(blobs[0].minX).toBe(2);
    expect(blobs[0].maxX).toBe(7);
    expect(blobs[0].minY).toBe(0);
    expect(blobs[0].maxY).toBe(0);
  });

  it("stairAbutsPanel tests the blob's extent against the panel within reach", () => {
    // Panel pixels two rows below the blob: out of reach at 1 px, within at 2.
    const panel = maskFrom([
      "..........",
      "..........",
      "#####.....",
    ]);
    const blob: StairBlob = { px: 7, py: 0, areaPx: 3, variant: "red", minX: 6, maxX: 8, minY: 0, maxY: 0 };

    expect(stairAbutsPanel(blob, panel, 1)).toBe(false);
    expect(stairAbutsPanel(blob, panel, 2)).toBe(true);
  });

  it("rejects a blob too large to be a stair", () => {
    // The floor-panel frame shares the Bla Trappa ink with blue stairs.
    const image = imageFrom(["ssssssssss", "ssssssssss"], { s: [0, 204, 255] });
    const { classMap, entryMap, width, height } = classifyPixels(image, PALETTE, OPTIONS);

    const blobs = findStairBlobs(classMap, entryMap, PALETTE, width, height, {
      ...BLOB_OPTS,
      maxAreaPx: 10,
    });
    expect(blobs).toHaveLength(0);
  });

  it("rejects a blob too elongated to be a stair", () => {
    const image = imageFrom(["ssssssssss"], { s: [0, 204, 255] });
    const { classMap, entryMap, width, height } = classifyPixels(image, PALETTE, OPTIONS);

    const blobs = findStairBlobs(classMap, entryMap, PALETTE, width, height, {
      ...BLOB_OPTS,
      maxElongation: 4,
    });
    expect(blobs).toHaveLength(0);
  });

  it("merges pieces of one staircase split by its letter label", () => {
    const image = imageFrom(["ss.ss.....", ".........."], { s: [239, 47, 44], ".": [255, 255, 255] });
    const { classMap, entryMap, width, height } = classifyPixels(image, PALETTE, OPTIONS);

    expect(findStairBlobs(classMap, entryMap, PALETTE, width, height, BLOB_OPTS)).toHaveLength(2);
    expect(
      findStairBlobs(classMap, entryMap, PALETTE, width, height, { ...BLOB_OPTS, mergeDistancePx: 5 }),
    ).toHaveLength(1);
  });

  it("reports distance so a stair can be assigned to its nearest panel", () => {
    // A stair is its own pixel role and so is never inside a free-space panel
    // mask. Ownership has to come from proximity, not overlap.
    const near = panelGraph();
    const far: TracedGraph = {
      pageIndex: 0,
      panelIndex: 1,
      nodes: [
        { id: 0, px: 0, py: 40, kind: "dead-end" },
        { id: 1, px: 9, py: 40, kind: "dead-end" },
      ],
      edges: [{ a: 0, b: 1, polyline: [] }],
    };
    const blob = { px: 4, py: 3, areaPx: 2, variant: "red" as const };

    expect(distanceToGraph(near, blob)).toBeCloseTo(3);
    expect(distanceToGraph(far, blob)).toBeCloseTo(37);
  });
});

describe("createPixelToEvent", () => {
  const mapData: MapData = {
    scale: 500,
    image: { width: 100, height: 50 },
    mapPositionTopLeft: { x: 0, y: 0 },
    mapPositionBottomRight: { x: 100, y: 50 },
    layout: "pages",
  };

  it("round-trips pixels through event space", () => {
    const mapping = createPixelToEvent(mapData, 0, 200);
    const event = mapping.toEvent(50, 25);
    const back = mapping.toPixel(event);

    expect(back.px).toBeCloseTo(50);
    expect(back.py).toBeCloseTo(25);
  });

  it("derives metres per pixel from the transform and the map scale", () => {
    // 200 px over 100 mm at 1:500 -> 0.5 mm/px -> 0.25 m/px.
    const mapping = createPixelToEvent(mapData, 0, 200);
    expect(mapping.metresPerPixel).toBeCloseTo(0.25);
  });

  it("uses each page's own transform for a manual multi-page map", () => {
    const multi: MapData = {
      ...mapData,
      pageCount: 2,
      layout: "horizontal",
      pageTransformMode: "manual",
      pageTransforms: [
        { topLeft: { x: 0, y: 0 }, bottomRight: { x: 100, y: 50 } },
        { topLeft: { x: 500, y: 0 }, bottomRight: { x: 600, y: 50 } },
      ],
    };

    const page0 = createPixelToEvent(multi, 0, 200);
    const page1 = createPixelToEvent(multi, 1, 200);

    expect(page0.toEvent(0, 0).x).toBeCloseTo(0);
    expect(page1.toEvent(0, 0).x).toBeCloseTo(500);
  });

  it("measures a document-wide raster against the document, not one page", () => {
    // Getting this wrong scales every metre-valued parameter by the page count.
    const composited: MapData = { ...mapData, pageCount: 2, layout: "horizontal" };
    const perPage = createPixelToEvent(composited, 0, 400, "page");
    const wholeDoc = createPixelToEvent(composited, 0, 400, "document");

    // The document is two pages wide, so measuring the same raster against the
    // whole document makes each pixel cover twice as much ground.
    expect(wholeDoc.metresPerPixel).toBeCloseTo(perPage.metresPerPixel * 2);
  });
});

describe("createMask", () => {
  it("fills when asked", () => {
    expect(countMask(createMask(3, 3, 1))).toBe(9);
  });
});
