import type { ReactNode } from "react";
import type { Polygon } from "@indoor-o-route-analysis/core";
import {
  POLYGON_STROKE_WIDTH,
  POLYGON_STROKE_COLOR_DEFAULT,
  POLYGON_STROKE_COLOR_SELECTED,
  POLYGON_FILL_COLOR_DEFAULT,
  POLYGON_FILL_COLOR_SELECTED,
} from "@indoor-o-route-analysis/core";

export interface PolygonPoint {
  x: number;
  y: number;
}

/** Centroid (average of vertices) of a polygon's points — used to place its level/floor label. */
export function getPolygonCentroid(points: PolygonPoint[]): PolygonPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return { x, y };
}

/** Builds an SVG path `d` string for a polygon (with optional holes, evenodd fill rule), in pixel space. */
export function buildPolygonPathData(polygon: Polygon, toPixels: (p: PolygonPoint) => PolygonPoint): string {
  let pathData = `M ${polygon.points.map((p) => {
    const pt = toPixels(p);
    return `${pt.x},${pt.y}`;
  }).join(" L ")} Z`;

  if (polygon.holes) {
    polygon.holes.forEach((hole) => {
      pathData += ` M ${hole
        .map((p) => {
          const pt = toPixels(p);
          return `${pt.x},${pt.y}`;
        })
        .join(" L ")} Z`;
    });
  }

  return pathData;
}

export interface RenderPolygonOutlineOptions {
  polygon: Polygon;
  toPixels: (p: PolygonPoint) => PolygonPoint;
  isSelected?: boolean;
  fillColor?: string;
  selectedFillColor?: string;
  strokeColor?: string;
  selectedStrokeColor?: string;
  strokeWidth?: number;
  /** Draws the polygon's level/floor number at its centroid. */
  showLevelLabel?: boolean;
  levelLabelColor?: string;
  selectedLevelLabelColor?: string;
}

/**
 * Renders a polygon's filled/stroked outline (with holes) and, optionally,
 * its floor/level number at the centroid. This covers the non-interactive
 * "read-only" 2D rendering shared by every viewer that shows floor
 * polygons; point/origin editing handles are viewer-specific (only
 * model-3d's polygon editor needs them) and stay there.
 */
export function renderPolygonOutline({
  polygon,
  toPixels,
  isSelected = false,
  fillColor = POLYGON_FILL_COLOR_DEFAULT,
  selectedFillColor = POLYGON_FILL_COLOR_SELECTED,
  strokeColor = POLYGON_STROKE_COLOR_DEFAULT,
  selectedStrokeColor = POLYGON_STROKE_COLOR_SELECTED,
  strokeWidth = POLYGON_STROKE_WIDTH,
  showLevelLabel = false,
  levelLabelColor = "#ffa500",
  selectedLevelLabelColor = "#007bff",
}: RenderPolygonOutlineOptions): ReactNode {
  const pathData = buildPolygonPathData(polygon, toPixels);

  return (
    <g key={polygon.id}>
      <path
        d={pathData}
        fill={isSelected ? selectedFillColor : fillColor}
        stroke={isSelected ? selectedStrokeColor : strokeColor}
        strokeWidth={strokeWidth}
        fillRule="evenodd"
      />
      {showLevelLabel &&
        polygon.points.length > 0 &&
        (() => {
          const centroid = getPolygonCentroid(polygon.points);
          const pt = toPixels(centroid);
          return (
            <text
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isSelected ? selectedLevelLabelColor : levelLabelColor}
              fontSize={48}
              fontWeight="bold"
            >
              {polygon.level ?? 0}
            </text>
          );
        })()}
    </g>
  );
}
