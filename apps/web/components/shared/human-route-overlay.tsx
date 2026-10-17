"use client";

import type { HumanRouteOverlayModel } from "@indoor-o-route-analysis/core";
import {
  HUMAN_OVERLAY_TRACKING_COLOR,
  HUMAN_OVERLAY_BACKTRACKING_COLOR,
  HUMAN_OVERLAY_CURRENT_COLOR,
  HUMAN_OVERLAY_MEETING_COLOR,
  HUMAN_OVERLAY_REJECTED_COLOR,
  HUMAN_OVERLAY_DISCARDED_OPACITY,
  GRAPH_NODE_RADIUS,
} from "@indoor-o-route-analysis/core";
import { renderHaloFilterDefs, HALO_FILTER_IDS } from "@indoor-o-route-analysis/ui";
import type { PointPx } from "./graph-overlay";

const ROUTE_HALO = `url(#${HALO_FILTER_IDS.whiteRoute})`;
const NODE_HALO = `url(#${HALO_FILTER_IDS.whiteNode})`;

interface HumanRouteOverlayProps {
  overlay: HumanRouteOverlayModel;
  /** nodeId -> same-floor cluster id, from HumanRouteResult.clusterOf. */
  clusterOf: Record<string, string>;
  /** Graph nodes in pixel space (same shape GraphOverlay consumes). */
  nodes: PointPx[];
}

/**
 * Renders the Labs "Human thinking" live overlay for *this step only* (no
 * visited-history fog): the tracking/backtracking "route in memory"
 * polylines, an origin ring marking exactly where the human currently
 * stands, every candidate's entry-point badge in its own distinct color
 * (rank-colored, individually traceable) with the chosen candidate's real
 * corridor path additionally drawn, a meeting pulse/rejection marker, and -
 * at closure - an explicit connector between the exact two points where the
 * two sides' routes join. The current routes, candidate entry points, and
 * the chosen path all get the shared white halo/glow filter (matching how
 * other selected map elements are highlighted) so they stand out from the
 * base map. Must be placed inside an <svg> or <g>, alongside GraphOverlay.
 * Pixel-space geometry only - all decision logic lives in
 * human-route-overlay.ts.
 */
export function HumanRouteOverlay({ overlay, clusterOf, nodes }: HumanRouteOverlayProps) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // One representative node per cluster, for placing candidate badges and
  // the meeting marker - clusters are floor regions, not single points.
  const representativePosForCluster = new Map<string, PointPx>();
  for (const node of nodes) {
    const cluster = clusterOf[node.id];
    if (cluster && !representativePosForCluster.has(cluster)) {
      representativePosForCluster.set(cluster, node);
    }
  }

  const markerRadius = GRAPH_NODE_RADIUS * 1.8;

  // Straight-segment polylines through each side's committed waypoints (see
  // HumanRouteMemorySnapshot.forwardPath/backwardPath) - the "route in
  // memory" so far. Points that don't resolve (should not normally happen)
  // are dropped rather than breaking the whole line.
  const pathPoints = (path?: string[]): PointPx[] =>
    (path ?? []).map((id) => nodeById.get(id)).filter((p): p is PointPx => !!p);
  const forwardPoints = pathPoints(overlay.forwardPath);
  const backwardPoints = pathPoints(overlay.backwardPath);

  return (
    <g pointerEvents="none">
      <defs>{renderHaloFilterDefs([HALO_FILTER_IDS.whiteRoute, HALO_FILTER_IDS.whiteNode])}</defs>

      {forwardPoints.length > 1 && (
        <polyline
          points={forwardPoints.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={HUMAN_OVERLAY_TRACKING_COLOR}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={ROUTE_HALO}
        />
      )}
      {backwardPoints.length > 1 && (
        <polyline
          points={backwardPoints.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={HUMAN_OVERLAY_BACKTRACKING_COLOR}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={ROUTE_HALO}
        />
      )}

      {overlay.origin && nodeById.get(overlay.origin) && (() => {
        const pos = nodeById.get(overlay.origin)!;
        return (
          <g key="human-origin">
            <circle cx={pos.x} cy={pos.y} r={markerRadius + 3} fill="none" stroke={HUMAN_OVERLAY_CURRENT_COLOR} strokeWidth={2} />
            <circle cx={pos.x} cy={pos.y} r={2.5} fill={HUMAN_OVERLAY_CURRENT_COLOR} />
          </g>
        );
      })()}

      {/* Only the chosen candidate gets its real corridor path drawn, with
          a halo to make it stand out as "the selected path for this step" - the
          other candidates are marked only by their entry-point badge below. */}
      {overlay.candidates.map((candidate) => {
        const pos = (candidate.toNode && nodeById.get(candidate.toNode))
          ?? representativePosForCluster.get(candidate.toCluster);
        if (!pos) return null;
        const candidatePoints = candidate.chosen ? pathPoints(candidate.path) : [];
        return (
          <g
            key={`human-candidate-${candidate.rank}-${candidate.label}`}
            data-human-candidate={candidate.label}
            data-chosen={candidate.chosen}
            opacity={candidate.chosen ? 1 : HUMAN_OVERLAY_DISCARDED_OPACITY}
          >
            {/* The candidate's real corridor walk, not a straight line - stops at the
                stair's near side; the badge below marks the far-side arrival point. */}
            {candidatePoints.length > 1 && (
              <polyline
                points={candidatePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={candidate.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={ROUTE_HALO}
              />
            )}
            <circle
              cx={pos.x} cy={pos.y - markerRadius - 8}
              r={7}
              fill={candidate.color}
              stroke="white"
              strokeWidth={candidate.chosen ? 1.75 : 1}
              filter={NODE_HALO}
            />
            <text
              x={pos.x} y={pos.y - markerRadius - 8}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fontWeight="bold"
              fill="white"
            >
              {candidate.rank}
            </text>
          </g>
        );
      })}

      {overlay.meetingCluster && (() => {
        const pos = representativePosForCluster.get(overlay.meetingCluster!);
        if (!pos) return null;
        const color = overlay.meetingRejected ? HUMAN_OVERLAY_REJECTED_COLOR : HUMAN_OVERLAY_MEETING_COLOR;
        return (
          <circle
            cx={pos.x} cy={pos.y}
            r={markerRadius * 1.6}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeDasharray={overlay.meetingRejected ? "4,3" : undefined}
          />
        );
      })()}

      {overlay.meetingConnector && (() => {
        const from = nodeById.get(overlay.meetingConnector!.from);
        const to = nodeById.get(overlay.meetingConnector!.to);
        if (!from || !to) return null;
        return (
          <g key="human-meeting-connector">
            {(from.x !== to.x || from.y !== to.y) && (
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={HUMAN_OVERLAY_MEETING_COLOR}
                strokeWidth={3}
                strokeLinecap="round"
              />
            )}
            <circle cx={from.x} cy={from.y} r={5} fill={HUMAN_OVERLAY_MEETING_COLOR} stroke="white" strokeWidth={1.5} />
            <circle cx={to.x} cy={to.y} r={5} fill={HUMAN_OVERLAY_MEETING_COLOR} stroke="white" strokeWidth={1.5} />
          </g>
        );
      })()}
    </g>
  );
}
