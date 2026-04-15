import { ScoringModel, type RouteContext, isLevelChangeEdge } from "./base";
import { findPolygonForPoint } from "../polygon-utils";
import type { Edge } from "../models/graph";

/**
 * Alpha Scoring Model v0.1
 *
 * Simple additive model where difficulty is the sum of:
 * - number of stairs upstairs    x 5
 * - number of stairs downstairs  x 5
 * - number of branching points   x 3
 *
 * A branching point is any node on the route where the total number of
 * connected edges exceeds what the route path alone requires (1 for the
 * first node, 2 for intermediate nodes). No consideration of edge
 * direction or one-way constraints.
 *
 * Stair direction (up/down) is determined by comparing the floor levels of
 * the two nodes connected by a level-change edge.
 *
 * Categories based on Stockholm Indoor Cup difficulty levels:
 * - White:  D0-D20  (least difficult)
 * - Yellow: D20-D40
 * - Orange: D40-D60
 * - Purple: D60-D80
 * - Black:  D80+    (most difficult)
 */
export class AlphaScoringModel extends ScoringModel {
  readonly id = "alpha";
  readonly name = "Alpha";
  readonly version = "0.1";
  readonly description = "Difficulty = upstairs*5 + downstairs*5 + branching*3";
  readonly scalingFactor = 100 / 102;
  readonly referenceCourse = "Stockholm Indoor Cup 2023 Etapp 1, Bana 1, 15→16";

  calculateDifficulty(context: RouteContext): number {
    if (context.path.length < 2) return 0;

    const stairs = this.countStairs(context);
    const branchingPoints = this.countBranchingPoints(context);

    const raw = stairs.up * 5 + stairs.down * 5 + branchingPoints * 3;
    return raw * (this.scalingFactor ?? 1);
  }

  /**
   * Count stairs (up and down) in the path based on actual floor levels.
   * Up = navigator moves to a higher level, Down = to a lower level.
   */
  private countStairs(context: RouteContext): { up: number; down: number } {
    let up = 0;
    let down = 0;

    if (!context.polygons?.length) return { up, down };

    for (let i = 0; i < context.path.length - 1; i++) {
      const fromId = context.path[i];
      const toId = context.path[i + 1];
      const edge = this.findEdge(context.edges, fromId, toId);
      if (!edge) continue;

      if (!isLevelChangeEdge(edge, context.nodes, context.controls, context.polygons)) {
        continue;
      }

      // Determine direction from actual floor levels
      const fromPos = this.findPosition(fromId, context);
      const toPos = this.findPosition(toId, context);
      if (!fromPos || !toPos) continue;

      const fromLevel = findPolygonForPoint(fromPos, context.polygons)?.level ?? 0;
      const toLevel = findPolygonForPoint(toPos, context.polygons)?.level ?? 0;

      if (toLevel > fromLevel) {
        up++;
      } else {
        down++;
      }
    }

    return { up, down };
  }

  /**
   * Count branching points along the route.
   *
   * A branching point is any node on the route where the total number of
   * connected edges is greater than the number of path edges at that node.
   * The first node has 1 path edge (outgoing); intermediate nodes have 2
   * (incoming + outgoing). Edge direction and one-way constraints are
   * ignored — only the raw edge count matters.
   */
  private countBranchingPoints(context: RouteContext): number {
    let count = 0;

    for (let i = 0; i < context.path.length - 1; i++) {
      const currentId = context.path[i];
      const connectedEdgeCount = context.edges.filter(
        (e) => e.from === currentId || e.to === currentId,
      ).length;

      // First node on path has 1 path edge (outgoing),
      // intermediate nodes have 2 (incoming + outgoing).
      const expectedPathEdges = i === 0 ? 1 : 2;

      if (connectedEdgeCount > expectedPathEdges) {
        count++;
      }
    }

    return count;
  }

  /**
   * Find the position (x, y) of a node or control by ID.
   */
  private findPosition(
    id: string,
    context: RouteContext,
  ): { x: number; y: number } | undefined {
    const node = context.nodes.find((n) => n.id === id);
    if (node) return { x: node.x, y: node.y };
    const control = context.controls.find((c) => c.id === id);
    if (control?.mapPosition)
      return { x: control.mapPosition.x, y: control.mapPosition.y };
    return undefined;
  }

  /**
   * Find an edge between two nodes (accounts for bidirectional edges).
   */
  private findEdge(
    edges: Edge[],
    fromId: string,
    toId: string,
  ): Edge | undefined {
    return edges.find(
      (e) =>
        (e.from === fromId && e.to === toId) ||
        (!e.oneWay && e.from === toId && e.to === fromId),
    );
  }
}
