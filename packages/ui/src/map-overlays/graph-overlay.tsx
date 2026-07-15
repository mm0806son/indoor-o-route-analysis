import type { ReactNode } from "react";
import type { Edge } from "@indoor-o-route-analysis/core";
import { GRAPH_EDGE_COLOR, GRAPH_EDGE_THICKNESS, GRAPH_NODE_RADIUS, GRAPH_DEAD_END_COLOR } from "@indoor-o-route-analysis/core";

export interface PointPx {
  id: string;
  x: number;
  y: number;
}

export interface GraphOverlayOptions {
  edges: Edge[];
  nodes: PointPx[];
  controls: PointPx[];
  showEdges?: boolean;
  showNodes?: boolean;
  /** Edge key (see core's `edgeKey`) of the currently selected edge, if any. */
  selectedEdgeKey?: string | null;
  /** Node/control id of the currently selected vertex, if any. */
  selectedNodeId?: string | null;
  /** Edge keys that should render in the dead-end color instead of the default edge color. */
  deadEndEdgeKeys?: Set<string>;
  /** Compute the edge key for an edge — pass core's `edgeKey`; defaults to `${from}->${to}`. */
  getEdgeKey?: (edge: Edge) => string;
}

const defaultEdgeKey = (edge: Edge) => `${edge.from}->${edge.to}`;

/**
 * Renders graph edges, nodes, and controls as SVG elements in pixel space.
 * Must be placed inside an <svg> or <g> element. Both showEdges and
 * showNodes default to false.
 *
 * Supports optional selection/dead-end styling (selectedEdgeKey,
 * selectedNodeId, deadEndEdgeKeys) so viewers that need interactive
 * highlighting (e.g. the graph editor) can use the same renderer as
 * read-only viewers instead of hand-rolling their own edge/node drawing.
 */
export function renderGraphOverlay({
  edges,
  nodes,
  controls,
  showEdges = false,
  showNodes = false,
  selectedEdgeKey = null,
  selectedNodeId = null,
  deadEndEdgeKeys,
  getEdgeKey = defaultEdgeKey,
}: GraphOverlayOptions): ReactNode {
  if (!showEdges && !showNodes) return null;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const controlMap = new Map(controls.map((c) => [c.id, c]));
  const findPx = (id: string) => nodeMap.get(id) ?? controlMap.get(id) ?? null;

  const visibleEdges = showEdges ? edges.filter((e) => !e.ignoreLength) : [];
  const showVertices = showEdges || showNodes;

  return (
    <g>
      {showEdges &&
        visibleEdges.map((edge, i) => {
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

          const key = getEdgeKey(edge);
          const isSelected = selectedEdgeKey === key;
          const isDeadEnd = deadEndEdgeKeys?.has(key) ?? false;
          const color = isDeadEnd ? GRAPH_DEAD_END_COLOR : GRAPH_EDGE_COLOR;
          const strokeWidth = isSelected ? Math.max(3, GRAPH_EDGE_THICKNESS * 1.2) : GRAPH_EDGE_THICKNESS;

          return (
            <line
              key={`edge-${key ?? i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={strokeWidth}
              opacity={isSelected ? 1 : 0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      {showVertices &&
        nodes.map((node) => (
          <circle
            key={`gnode-${node.id}`}
            cx={node.x}
            cy={node.y}
            r={GRAPH_NODE_RADIUS}
            fill={GRAPH_EDGE_COLOR}
            fillOpacity={0.5}
            stroke={GRAPH_EDGE_COLOR}
            strokeWidth={selectedNodeId === node.id ? 2.5 : 1.5}
            pointerEvents="none"
          />
        ))}
      {showVertices &&
        controls.map((control) => (
          <circle
            key={`gcontrol-${control.id}`}
            cx={control.x}
            cy={control.y}
            r={GRAPH_NODE_RADIUS}
            fill={GRAPH_EDGE_COLOR}
            fillOpacity={0.5}
            stroke="#a855f7"
            strokeWidth={selectedNodeId === control.id ? 2.5 : 1.5}
            pointerEvents="none"
          />
        ))}
    </g>
  );
}
