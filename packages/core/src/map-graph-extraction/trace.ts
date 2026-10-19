/**
 * Converts a thinned skeleton into a {@link TracedGraph}.
 *
 * Node identity is assigned here and carried by reference from this point on.
 * It is never recovered later by comparing coordinates: simplification and
 * resampling move endpoints, so coordinate equality stops holding while the
 * topology is unchanged.
 */

import { connectedComponents, createMask } from "./morphology";
import { neighbourDegrees } from "./skeleton";
import type { BitMask, TracedEdge, TracedGraph, TracedNode } from "./types";

/** Clearance at a fractional pixel position, or undefined when unavailable. */
function sampleClearance(
  clearance: Float64Array | undefined,
  mask: BitMask,
  px: number,
  py: number,
): number | undefined {
  if (!clearance) return undefined;
  const x = Math.min(mask.width - 1, Math.max(0, Math.round(px)));
  const y = Math.min(mask.height - 1, Math.max(0, Math.round(py)));
  return clearance[y * mask.width + x];
}

const NEIGHBOURS: readonly [number, number][] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function* skeletonNeighbours(mask: BitMask, p: number): Generator<number> {
  const { width, height, data } = mask;
  const x = p % width;
  const y = (p - x) / width;

  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const q = ny * width + nx;
    if (data[q]) yield q;
  }
}

/**
 * Traces a skeleton into nodes and edges.
 *
 * Junction pixels (8-degree ≥ 3) fragment into small clumps rather than single
 * pixels, so they are clustered into one node each before tracing. Otherwise a
 * simple four-way crossing would yield several nodes a pixel apart.
 */
export function traceSkeleton(
  skeleton: BitMask,
  pageIndex: number,
  panelIndex: number,
  clearance?: Float64Array,
): TracedGraph {
  const { width, data } = skeleton;
  const degrees = neighbourDegrees(skeleton);

  // Cluster junction pixels so each crossing becomes exactly one node.
  const junctionMask = createMask(skeleton.width, skeleton.height);
  for (let p = 0; p < data.length; p++) {
    if (data[p] && degrees[p] >= 3) junctionMask.data[p] = 1;
  }
  const junctionClusters = connectedComponents(junctionMask);

  const nodes: TracedNode[] = [];
  const pixelToNode = new Map<number, number>();

  const clusterSums = new Map<number, { x: number; y: number; n: number; pixels: number[] }>();
  for (let p = 0; p < junctionClusters.labels.length; p++) {
    const label = junctionClusters.labels[p];
    if (!label) continue;
    const x = p % width;
    const y = (p - x) / width;
    let acc = clusterSums.get(label);
    if (!acc) {
      acc = { x: 0, y: 0, n: 0, pixels: [] };
      clusterSums.set(label, acc);
    }
    acc.x += x;
    acc.y += y;
    acc.n++;
    acc.pixels.push(p);
  }

  for (const acc of clusterSums.values()) {
    const id = nodes.length;
    const px = acc.x / acc.n;
    const py = acc.y / acc.n;
    nodes.push({ id, px, py, kind: "junction", clearancePx: sampleClearance(clearance, skeleton, px, py) });
    for (const p of acc.pixels) pixelToNode.set(p, id);
  }

  // Dead ends become nodes too; the hand-drawn corpus is 10-20% degree-1 nodes.
  for (let p = 0; p < data.length; p++) {
    if (!data[p] || degrees[p] !== 1 || pixelToNode.has(p)) continue;
    const x = p % width;
    const y = (p - x) / width;
    const id = nodes.length;
    nodes.push({ id, px: x, py: y, kind: "dead-end", clearancePx: clearance?.[p] });
    pixelToNode.set(p, id);
  }

  const edges: TracedEdge[] = [];
  const consumed = new Uint8Array(data.length);
  const directEdgeKeys = new Set<string>();

  for (const [startPixel, startNode] of pixelToNode) {
    for (const first of skeletonNeighbours(skeleton, startPixel)) {
      const neighbourNode = pixelToNode.get(first);
      if (neighbourNode === startNode) continue;

      if (neighbourNode !== undefined) {
        // Two node pixels touching directly: a zero-length branch.
        const key =
          startNode < neighbourNode ? `${startNode}|${neighbourNode}` : `${neighbourNode}|${startNode}`;
        if (!directEdgeKeys.has(key)) {
          directEdgeKeys.add(key);
          edges.push({ a: startNode, b: neighbourNode, polyline: [] });
        }
        continue;
      }

      if (consumed[first]) continue;

      const polyline: { px: number; py: number }[] = [];
      let previous = startPixel;
      let current = first;
      let endNode: number | undefined;

      while (true) {
        consumed[current] = 1;
        const x = current % width;
        polyline.push({ px: x, py: (current - x) / width });

        let next: number | undefined;
        for (const candidate of skeletonNeighbours(skeleton, current)) {
          if (candidate === previous) continue;
          if (pixelToNode.has(candidate)) {
            next = candidate;
            break;
          }
          if (!consumed[candidate]) next = candidate;
        }

        if (next === undefined) break;
        const nextNode = pixelToNode.get(next);
        if (nextNode !== undefined) {
          endNode = nextNode;
          break;
        }
        previous = current;
        current = next;
      }

      if (endNode === undefined) {
        // The chain ran out without reaching a node: promote its tail.
        const tail = polyline[polyline.length - 1];
        const id = nodes.length;
        nodes.push({ id, px: tail.px, py: tail.py, kind: "dead-end" });
        endNode = id;
        polyline.pop();
      }

      edges.push({ a: startNode, b: endNode, polyline });
    }
  }

  traceIsolatedLoops(skeleton, consumed, pixelToNode, nodes, edges, width);

  return { pageIndex, panelIndex, nodes, edges };
}

/**
 * Picks up closed corridor loops that contain no junction and no dead end.
 *
 * Every pixel on such a loop has degree 2, so it is never reached from a node
 * and would otherwise be dropped silently — a ring corridor around an atrium is
 * exactly this shape.
 */
function traceIsolatedLoops(
  skeleton: BitMask,
  consumed: Uint8Array,
  pixelToNode: Map<number, number>,
  nodes: TracedNode[],
  edges: TracedEdge[],
  width: number,
): void {
  const { data } = skeleton;

  for (let seed = 0; seed < data.length; seed++) {
    if (!data[seed] || consumed[seed] || pixelToNode.has(seed)) continue;

    const seedX = seed % width;
    const anchor = nodes.length;
    nodes.push({ id: anchor, px: seedX, py: (seed - seedX) / width, kind: "junction" });
    pixelToNode.set(seed, anchor);
    consumed[seed] = 1;

    const polyline: { px: number; py: number }[] = [];
    let previous = seed;
    let current = -1;
    for (const candidate of skeletonNeighbours(skeleton, seed)) {
      current = candidate;
      break;
    }
    if (current < 0) continue;

    while (current !== seed) {
      consumed[current] = 1;
      const x = current % width;
      polyline.push({ px: x, py: (current - x) / width });

      let next: number | undefined;
      for (const candidate of skeletonNeighbours(skeleton, current)) {
        if (candidate === previous) continue;
        next = candidate;
        if (candidate === seed) break;
      }
      if (next === undefined) break;
      previous = current;
      current = next;
    }

    edges.push({ a: anchor, b: anchor, polyline });
  }
}
