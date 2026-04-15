
import { Polygon } from "./models";

export const ROUTE_HEIGHT_OFFSET = 0.25;

export const isPointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

export const findPolygonForPoint = (
  point: { x: number; y: number; level?: number },
  levelPolygons: Polygon[],
): Polygon | undefined => {
  let polygon: Polygon | undefined;

  // 1. If we have a specific level, prioritize polygons on that level
  if (point.level !== undefined) {
    // Try to find a polygon on that level that contains the point
    polygon = levelPolygons.find((poly) => poly.level === point.level && isPointInPolygon(point, poly.points));

    // If not found inside any polygon on that level, fallback to any polygon on that level IF there is only one.
    // If there are multiple polygons (e.g. multiple map parts), we cannot safely guess the origin.
    if (!polygon) {
      const polygonsOnLevel = levelPolygons.filter((poly) => poly.level === point.level);
      if (polygonsOnLevel.length === 1) {
        polygon = polygonsOnLevel[0];
      } else if (polygonsOnLevel.length > 1) {
        // Find closest polygon by checking distance to vertices
        let minDistance = Infinity;
        let closestPoly: Polygon | undefined;

        polygonsOnLevel.forEach((poly) => {
          poly.points.forEach((v) => {
            const dist = Math.sqrt(Math.pow(point.x - v.x, 2) + Math.pow(point.y - v.y, 2));
            if (dist < minDistance) {
              minDistance = dist;
              closestPoly = poly;
            }
          });
        });

        polygon = closestPoly;
      }
    }
  }

  // 2. If no polygon found yet (level undefined or no polygon on that level), search all polygons
  if (!polygon) {
    polygon = levelPolygons.find((poly) => isPointInPolygon(point, poly.points));
  }

  return polygon;
};
