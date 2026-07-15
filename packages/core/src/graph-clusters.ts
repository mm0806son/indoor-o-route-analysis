/**
 * Same-floor clustering shared by the human-route search, the alternative-
 * path enumerator, and the Labs "Clustered Graph" visualization. A cluster
 * is a set of nodes reachable from each other via unlabeled, bidirectional
 * edges (ordinary corridors) - labeled edges (stairs) and one-way unlabeled
 * edges are cluster-graph seams, not intra-cluster connections.
 */

import type { Edge } from "./models/graph";
import { UnionFind } from "./utils/union-find";

/** Builds the Union-Find structure grouping nodes into same-floor clusters. */
export function computeSameFloorClusters(edges: Edge[]): UnionFind {
  const uf = new UnionFind();
  for (const edge of edges) {
    if ((!edge.label || edge.label === "") && !edge.oneWay) {
      uf.union(edge.from, edge.to);
    }
  }
  return uf;
}

export interface ClusteredGraph {
  /** nodeId -> cluster representative id, for every node touched by an edge. */
  clusterOf: Record<string, string>;
  /** Unique cluster ids, in first-seen order (deterministic for a given edge list). */
  clusters: string[];
}

/** Clusters every node in the graph (not just one leg's local context). */
export function computeClusteredGraph(edges: Edge[]): ClusteredGraph {
  const uf = computeSameFloorClusters(edges);
  const clusterOf: Record<string, string> = {};
  const clusters: string[] = [];
  const seen = new Set<string>();

  const record = (nodeId: string) => {
    const cluster = uf.find(nodeId);
    clusterOf[nodeId] = cluster;
    if (!seen.has(cluster)) {
      seen.add(cluster);
      clusters.push(cluster);
    }
  };

  for (const edge of edges) {
    record(edge.from);
    record(edge.to);
  }

  return { clusterOf, clusters };
}

/**
 * Deterministic, maximally-distinct color per cluster using golden-angle hue
 * spacing (each successive hue is ~137.5° from the last, so adjacent cluster
 * indices never land on similar colors, regardless of how many clusters
 * there are).
 */
export function assignClusterColors(clusters: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  clusters.forEach((cluster, i) => {
    const hue = (i * 137.508) % 360;
    colors[cluster] = `hsl(${hue.toFixed(1)}, 65%, 55%)`;
  });
  return colors;
}
