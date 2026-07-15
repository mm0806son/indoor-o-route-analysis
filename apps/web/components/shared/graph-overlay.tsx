"use client";

import type { Edge } from "@indoor-o-route-analysis/core";
import { GRAPH_EDGE_COLOR, GRAPH_EDGE_THICKNESS, GRAPH_NODE_RADIUS } from "@indoor-o-route-analysis/core";

export interface PointPx {
  id: string;
  x: number;
  y: number;
}

interface GraphOverlayProps {
  edges: Edge[];
  nodes: PointPx[];
  controls: PointPx[];
  showEdges?: boolean;
  showNodes?: boolean;
}

/**
 * Renders graph edges, nodes, and controls as SVG elements in pixel space.
 * Must be placed inside an <svg> or <g> element.
 * Both showEdges and showNodes default to false.
 * In route analysis, pass showNodes={showEdges} to mirror the existing behaviour.
 */
export function GraphOverlay({ edges, nodes, controls, showEdges = false, showNodes = false }: GraphOverlayProps) {
  if (!showEdges && !showNodes) return null;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const controlMap = new Map(controls.map(c => [c.id, c]));
  const findPx = (id: string) => nodeMap.get(id) ?? controlMap.get(id) ?? null;

  const visibleEdges = showEdges ? edges.filter(e => !e.ignoreLength) : [];
  const showVertices = showEdges || showNodes;

  return (
    <g>
      {showEdges && visibleEdges.map((edge, i) => {
        const p1 = findPx(edge.from);
        const p2 = findPx(edge.to);
        if (!p1 || !p2) return null;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const r = GRAPH_NODE_RADIUS;
        const x1 = dist > r * 2 ? p1.x + r * Math.cos(angle) : p1.x;
        const y1 = dist > r * 2 ? p1.y + r * Math.sin(angle) : p1.y;
        const x2 = dist > r * 2 ? p2.x - r * Math.cos(angle) : p2.x;
        const y2 = dist > r * 2 ? p2.y - r * Math.sin(angle) : p2.y;
        return (
          <line
            key={`edge-${i}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={GRAPH_EDGE_COLOR}
            strokeWidth={GRAPH_EDGE_THICKNESS}
            opacity={0.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {showVertices && nodes.map(node => (
        <circle
          key={`gnode-${node.id}`}
          cx={node.x} cy={node.y}
          r={GRAPH_NODE_RADIUS}
          fill={GRAPH_EDGE_COLOR}
          fillOpacity={0.5}
          stroke={GRAPH_EDGE_COLOR}
          strokeWidth={1.5}
          pointerEvents="none"
        />
      ))}
      {showVertices && controls.map(control => (
        <circle
          key={`gcontrol-${control.id}`}
          cx={control.x} cy={control.y}
          r={GRAPH_NODE_RADIUS}
          fill={GRAPH_EDGE_COLOR}
          fillOpacity={0.5}
          stroke="#a855f7"
          strokeWidth={1.5}
          pointerEvents="none"
        />
      ))}
    </g>
  );
}
