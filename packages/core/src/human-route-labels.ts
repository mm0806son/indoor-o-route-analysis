/**
 * Resolves the internal ids a human-route search works with (graph nodes,
 * same-floor clusters) to human-readable labels for narration and export:
 * the course-relative control number ("3", "S", "F") when a cluster is the
 * leg's own start/end control, and a floor label derived from the polygon
 * containing a node (see polygon-utils.ts) otherwise. Pure and stateless
 * beyond simple caching - no course-wide computation happens here, callers
 * pass in the two labels already resolved for this specific leg (e.g. via
 * getCourseControlLabels).
 */

import type { Node } from "./models/graph";
import type { Control } from "./models/control";
import type { Polygon } from "./models/polygon";
import { findPolygonForPoint } from "./polygon-utils";

export interface HumanRouteLabelResolver {
  /** The leg's own control number/code ("3", "S", "F") if `id` is the start or end control's cluster/node, else undefined. */
  controlNumberOf(id: string): string | undefined;
  /** A floor label (e.g. "floor 2") derived from the polygon containing `id`'s node, if resolvable. */
  floorLabelOf(id: string): string | undefined;
  /** The raw numeric floor level backing `floorLabelOf`, for comparing two positions (e.g. to say "up"/"down"). */
  floorLevelOf(id: string): number | undefined;
}

export interface HumanRouteLabelContext {
  /** nodeId -> same-floor cluster id, from HumanRouteResult.clusterOf. */
  clusterOf: Record<string, string>;
  fromNodeId: string;
  fromLabel: string;
  toNodeId: string;
  toLabel: string;
  resolveNode(id: string): Node | Control | null;
  getCoordinates(item: Node | Control): { x: number; y: number };
  polygons: Polygon[];
}

function formatFloor(level: number | undefined): string | undefined {
  return level === undefined ? undefined : `floor ${level}`;
}

export function buildHumanRouteLabelResolver(ctx: HumanRouteLabelContext): HumanRouteLabelResolver {
  const fromCluster = ctx.clusterOf[ctx.fromNodeId];
  const toCluster = ctx.clusterOf[ctx.toNodeId];
  const levelCache = new Map<string, number | undefined>();

  const levelOf = (id: string): number | undefined => {
    if (levelCache.has(id)) return levelCache.get(id);
    const node = ctx.resolveNode(id);
    const level = node ? findPolygonForPoint(ctx.getCoordinates(node), ctx.polygons)?.level : undefined;
    levelCache.set(id, level);
    return level;
  };

  return {
    controlNumberOf(id: string): string | undefined {
      if (id === ctx.fromNodeId || (fromCluster !== undefined && id === fromCluster)) return ctx.fromLabel;
      if (id === ctx.toNodeId || (toCluster !== undefined && id === toCluster)) return ctx.toLabel;
      return undefined;
    },
    floorLabelOf(id: string): string | undefined {
      return formatFloor(levelOf(id));
    },
    floorLevelOf(id: string): number | undefined {
      return levelOf(id);
    },
  };
}
