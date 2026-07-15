import type { ReactNode } from "react";

export interface RoutePathPoint {
  x: number;
  y: number;
}

export interface RoutePathSegment {
  points: RoutePathPoint[];
  /** True for a map-segment-transition (ignoreLength edge, e.g. a jump between disconnected map pages) that should not be drawn as a travelled line. */
  isMapSegmentTransition: boolean;
}

export interface RouteArrowPosition {
  x: number;
  y: number;
  angle: number;
  /** Cumulative travelled distance (in the same pixel units as the path) at this arrow. */
  dist: number;
}

/**
 * Splits a node-id path into drawable polyline segments, breaking the line
 * wherever the traversed edge is a "map-segment transition" (ignoreLength
 * edge, e.g. a jump between disconnected map pages) so those hops are never
 * drawn as a travelled line.
 */
export function buildRoutePathSegments(
  path: string[],
  findPointPx: (nodeId: string) => RoutePathPoint | null,
  isIgnoreLengthEdge: (fromId: string, toId: string) => boolean,
): RoutePathSegment[] {
  const segments: RoutePathSegment[] = [];
  let currentSegment: RoutePathPoint[] = [];
  let currentIsIgnoreLength = false;

  for (let i = 0; i < path.length; i++) {
    const nodeId = path[i];
    const point = findPointPx(nodeId);
    if (!point) continue;

    if (i === 0) {
      currentSegment.push(point);
      continue;
    }

    const prevNodeId = path[i - 1];
    const isIgnoreLength = isIgnoreLengthEdge(prevNodeId, nodeId);

    if (isIgnoreLength !== currentIsIgnoreLength && currentSegment.length > 0) {
      segments.push({ points: [...currentSegment], isMapSegmentTransition: currentIsIgnoreLength });
      currentSegment = [currentSegment[currentSegment.length - 1]];
      currentIsIgnoreLength = isIgnoreLength;
    }
    currentSegment.push(point);
  }

  if (currentSegment.length > 0) {
    segments.push({ points: currentSegment, isMapSegmentTransition: currentIsIgnoreLength });
  }

  return segments;
}

/** Total length (in pixel units) of the non-transition segments. */
export function computeRoutePathLength(segments: RoutePathSegment[]): { totalLength: number; segmentLengths: number[] } {
  let totalLength = 0;
  const segmentLengths: number[] = [];

  segments.forEach((segment) => {
    if (segment.isMapSegmentTransition) {
      segmentLengths.push(0);
      return;
    }
    let segmentLength = 0;
    for (let i = 0; i < segment.points.length - 1; i++) {
      const dx = segment.points[i + 1].x - segment.points[i].x;
      const dy = segment.points[i + 1].y - segment.points[i].y;
      segmentLength += Math.hypot(dx, dy);
    }
    segmentLengths.push(segmentLength);
    totalLength += segmentLength;
  });

  return { totalLength, segmentLengths };
}

/** Distributes direction arrows evenly along the path at `arrowSpacingPx` intervals. */
export function computeRouteArrowPositions(
  segments: RoutePathSegment[],
  segmentLengths: number[],
  totalLength: number,
  arrowSpacingPx: number,
): RouteArrowPosition[] {
  const arrowPositions: RouteArrowPosition[] = [];
  if (totalLength <= 0 || arrowSpacingPx <= 0) return arrowPositions;

  const numArrows = Math.floor(totalLength / arrowSpacingPx);
  for (let arrowIdx = 0; arrowIdx < numArrows; arrowIdx++) {
    const targetDist = (arrowIdx + 1) * arrowSpacingPx;
    let accumulatedDist = 0;

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const segment = segments[segIdx];
      if (segment.isMapSegmentTransition) continue;

      const segmentLength = segmentLengths[segIdx];
      if (accumulatedDist + segmentLength >= targetDist) {
        const distInSegment = targetDist - accumulatedDist;
        let traveled = 0;

        for (let i = 0; i < segment.points.length - 1; i++) {
          const p1 = segment.points[i];
          const p2 = segment.points[i + 1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const edgeLength = Math.hypot(dx, dy);

          if (traveled + edgeLength >= distInSegment) {
            const t = edgeLength > 0 ? (distInSegment - traveled) / edgeLength : 0;
            const x = p1.x + dx * t;
            const y = p1.y + dy * t;
            const angle = Math.atan2(dy, dx);
            arrowPositions.push({ x, y, angle, dist: targetDist });
            break;
          }
          traveled += edgeLength;
        }
        break;
      }
      accumulatedDist += segmentLength;
    }
  }

  return arrowPositions;
}

export interface RenderRoutePolylinesOptions {
  color: string;
  strokeWidth: number;
  opacity?: number;
  /**
   * When provided, only the path up to this travelled distance (in the same
   * pixel units as the segments) is drawn — used for scrub/video-export
   * rendering of partial playback. When omitted, the full path is drawn.
   */
  revealedLength?: number;
}

/** Renders the static polyline(s) for a route path (excludes map-segment-transition hops). */
export function renderRoutePolylines(
  segments: RoutePathSegment[],
  { color, strokeWidth, opacity = 1, revealedLength }: RenderRoutePolylinesOptions,
): ReactNode[] {
  const elements: ReactNode[] = [];
  let remaining = revealedLength;

  segments.forEach((segment, segIdx) => {
    if (segment.points.length < 2 || segment.isMapSegmentTransition) return;

    let points = segment.points;
    if (remaining !== undefined) {
      if (remaining <= 0) return;
      const cutoff = cutSegmentAtDistance(segment.points, remaining);
      points = cutoff.points;
      remaining -= cutoff.consumed;
    }
    if (points.length < 2) return;

    const pointsStr = points.map((p) => `${p.x},${p.y}`).join(" ");
    elements.push(
      <polyline
        key={`segment-${segIdx}`}
        points={pointsStr}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />,
    );
  });

  return elements;
}

/** Returns the leading sub-path of `points` that covers at most `maxDistance`, plus the distance actually consumed. */
function cutSegmentAtDistance(points: RoutePathPoint[], maxDistance: number): { points: RoutePathPoint[]; consumed: number } {
  const result: RoutePathPoint[] = [points[0]];
  let remaining = maxDistance;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    if (remaining >= len) {
      result.push(p2);
      remaining -= len;
    } else {
      const t = len === 0 ? 0 : remaining / len;
      result.push({ x: p1.x + dx * t, y: p1.y + dy * t });
      remaining = 0;
      break;
    }
  }

  return { points: result, consumed: maxDistance - Math.max(remaining, 0) };
}

export interface RenderRouteArrowsOptions {
  color: string;
  /** Half-width of the arrowhead (typically strokeWidth / 2). */
  lineThickness: number;
  size?: number;
  /** When provided, arrows beyond this travelled distance are hidden (mirrors `revealedLength` on the polyline). */
  revealedLength?: number;
}

/** Renders directional arrowheads at the given positions along a route path. */
export function renderRouteArrows(
  arrowPositions: RouteArrowPosition[],
  { color, lineThickness, size = 2, revealedLength }: RenderRouteArrowsOptions,
): ReactNode[] {
  return arrowPositions
    .filter((arrow) => revealedLength === undefined || arrow.dist <= revealedLength)
    .map((arrow, idx) => (
      <polygon
        key={`arrow-${idx}`}
        points={`${arrow.x},${arrow.y} ${arrow.x - lineThickness * size * Math.cos(arrow.angle - 0.4)},${
          arrow.y - lineThickness * size * Math.sin(arrow.angle - 0.4)
        } ${arrow.x - lineThickness * size * Math.cos(arrow.angle + 0.4)},${
          arrow.y - lineThickness * size * Math.sin(arrow.angle + 0.4)
        }`}
        fill={color}
        stroke={color}
        strokeWidth={0.5}
        opacity={1}
      />
    ));
}

/** Lightens a "#rrggbb" color towards white by the given fraction (0-1); used for route arrow color. */
export function lightenColor(hex: string, fraction: number = 0.5): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lighten = (c: number) => Math.min(255, Math.floor(c + (255 - c) * fraction));
  return `#${lighten(r).toString(16).padStart(2, "0")}${lighten(g).toString(16).padStart(2, "0")}${lighten(b)
    .toString(16)
    .padStart(2, "0")}`;
}

export type RouteMarkerType = "decision" | "branching";

export interface RenderRouteMarkerOptions {
  type: RouteMarkerType;
  color: string;
  radius?: number;
}

/**
 * Renders a single decision-point ("brain") or branching-point ("split")
 * marker at a node position — a white-filled circle outlined in the route
 * color with a small icon glyph, matching the icon used in the toolbar
 * (Lucide "brain" / "split").
 */
export function renderRouteMarker(node: RoutePathPoint, key: string, { type, color, radius = 8 }: RenderRouteMarkerOptions): ReactNode {
  const iconPath =
    type === "branching" ? (
      <g transform={`translate(${node.x - 5}, ${node.y - 5}) scale(0.4167)`}>
        <path d="M16 3h5v5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 3H3v5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="m15 9 6-6" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ) : (
      <g transform={`translate(${node.x - 5}, ${node.y - 5}) scale(0.4167)`}>
        <path
          d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.477 10.896a4 4 0 0 1 .585-.396" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19.938 10.5a4 4 0 0 1 .585.396" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 18a4 4 0 0 1-1.967-.516" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19.967 17.484A4 4 0 0 1 18 18" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );

  return (
    <g key={key}>
      <circle cx={node.x} cy={node.y} r={radius} fill="white" stroke={color} strokeWidth={2} opacity={0.95} />
      {iconPath}
    </g>
  );
}

/** Renders decision/branching markers for every node in `nodes`, in order (rendered in the given array order — callers should render branching markers before decision markers so decision points win when they overlap, matching the route-analysis viewer). */
export function renderRouteMarkers(
  nodes: Array<{ nodeId: string; node: RoutePathPoint }>,
  options: RenderRouteMarkerOptions,
): ReactNode[] {
  return nodes.map(({ nodeId, node }, idx) => renderRouteMarker(node, `${options.type}-${nodeId}-${idx}`, options));
}
