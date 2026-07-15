import type { Control } from "../models/control";
import type { Node } from "../models/graph";
import { MM_TO_METERS } from "../rendering-constants";

/**
 * Extracts x/y coordinates from a Node (has x/y directly) or a Control (has
 * mapPosition). Both types are guaranteed to carry one or the other.
 */
export function getCoordinates(item: Node | Control): { x: number; y: number } {
  if ("mapPosition" in item) {
    return item.mapPosition;
  }
  return { x: item.x, y: item.y };
}

/**
 * Euclidean distance between two map-document points (millimeters),
 * converted to real-world meters via the map scale.
 */
export function straightLineDistanceMeters(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  mapScale: number,
): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y) * mapScale * MM_TO_METERS;
}

/**
 * Convex hull via the monotone chain algorithm (Andrew, 1979), O(n log n).
 * Returns hull vertices in counter-clockwise order, deduplicated. Fewer
 * than 3 distinct points cannot form an area - the input's distinct points
 * are returned as-is (0, 1, or 2 of them) for the caller to handle (e.g.
 * fall back to a circle or a capsule shape for rendering).
 */
export function computeConvexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const unique = Array.from(new Map(points.map((p) => [`${p.x},${p.y}`, p])).values())
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));

  if (unique.length < 3) return unique;

  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const buildHalf = (pts: { x: number; y: number }[]): { x: number; y: number }[] => {
    const hull: { x: number; y: number }[] = [];
    for (const p of pts) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
        hull.pop();
      }
      hull.push(p);
    }
    return hull;
  };

  const lower = buildHalf(unique);
  const upper = buildHalf([...unique].reverse());
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}
