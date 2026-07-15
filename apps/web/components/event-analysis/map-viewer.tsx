"use client";

import type React from "react";
import { forwardRef, useImperativeHandle, useRef, useMemo } from "react";
import MapViewer, { type MapViewerState, type MapViewerController, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { exportCanvasAndSvgAsImage, exportCanvasAndSvgAsPdf } from "@indoor-o-route-analysis/core/export";
import type { Edge } from "@indoor-o-route-analysis/core";
import type { Node } from "@indoor-o-route-analysis/core";
import type { Control } from "@indoor-o-route-analysis/core";
import type { MapData } from "@indoor-o-route-analysis/core";
import type { EdgeTraffic, NodeTraffic } from "./analysis-logic";
import { edgeKey } from "@indoor-o-route-analysis/core";

interface EventAnalysisMapViewerProps {
  map?: MapData;
  pdfUrl: string | null;
  edgeTraffic: Map<string, EdgeTraffic>;
  nodeTraffic: Map<string, NodeTraffic>;
  visualizationMode: "heatmap" | "thickness" | "both";
  metricMode: "total" | "collision";
  showEdges: boolean;
  showNodes: boolean;
  showBackgroundMap: boolean;
  isMapMuted: boolean;
  selectedElementId: string | null;
  onElementClick: (id: string, type: "edge" | "node") => void;
}

export interface EventAnalysisMapViewerHandle {
  exportImage: (filename: string) => Promise<void>;
  exportPdf: (filename: string) => Promise<void>;
}

function getHeatmapColor(value: number, max: number): string {
  if (max === 0) return "#22c55e"; // Green color
  const ratio = Math.min(1, value / max);
  // Green to Red
  // Green: 34, 197, 94
  // Red: 239, 68, 68
  const r = 34 + (239 - 34) * ratio;
  const g = 197 + (68 - 197) * ratio;
  const b = 94 + (68 - 94) * ratio;
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export default forwardRef(function EventAnalysisMapViewer(
  {
    map,
    pdfUrl,
    edgeTraffic,
    nodeTraffic,
    visualizationMode,
    metricMode,
    showEdges,
    showNodes,
    showBackgroundMap,
    isMapMuted,
    selectedElementId,
    onElementClick,
  }: EventAnalysisMapViewerProps,
  ref: React.Ref<EventAnalysisMapViewerHandle>,
) {
  const { selectedEvent } = useAppData();
  const mapStateRef = useRef<MapViewerState | null>(null);
  const controllerRef = useRef<MapViewerController | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const controls = selectedEvent?.raceCourses?.[0]?.controls || [];
  const edges = selectedEvent?.raceCourses?.[0]?.edges || [];
  const nodes = selectedEvent?.raceCourses?.[0]?.vertices || []; // Using nodes var name for less refactoring locally

  useImperativeHandle(ref, () => ({
    exportImage: async (filename: string) => {
      const controller = controllerRef.current;
      const svg = svgRef.current;
      if (!controller || !svg) return;

      const canvas = controller.getCanvas();
      if (!canvas) return;

      await exportCanvasAndSvgAsImage(canvas, svg, filename, {
        showBackground: showBackgroundMap,
        backgroundOpacity: isMapMuted ? 0.3 : 1,
      });
    },
    exportPdf: async (filename: string) => {
      const controller = controllerRef.current;
      const svg = svgRef.current;
      if (!controller || !svg) return;

      const canvas = controller.getCanvas();
      if (!canvas) return;

      await exportCanvasAndSvgAsPdf(canvas, svg, filename, {
        showBackground: showBackgroundMap,
        backgroundOpacity: isMapMuted ? 0.3 : 1,
      });
    },
  }));

  // Calculate Max Values based on metricMode
  const maxEdgeTraffic = useMemo(() => {
    let max = 0;
    edgeTraffic.forEach((v) => {
      const val = metricMode === "total" ? v.total : v.collision;
      max = Math.max(max, val);
    });
    return max;
  }, [edgeTraffic, metricMode]);

  const maxNodeTraffic = useMemo(() => {
    if (metricMode === "collision") return 0; // Dont show nodes in collision mode
    let max = 0;
    nodeTraffic.forEach((v) => {
      max = Math.max(max, v.count);
    });
    return max;
  }, [nodeTraffic, metricMode]);

  // Render SVG Content
  const renderSvgContent = (state: MapViewerState) => {
    const toPixels = (p: { x: number; y: number }) => eventPosToMultiPagePixels(p, map, state.pixelsPerMM);

    const getPos = (n: Node | Control) => {
      if ("mapPosition" in n && n.mapPosition) {
        return n.mapPosition;
      }
      return { x: (n as Node).x, y: (n as Node).y };
    };

    const lines: React.ReactElement[] = [];
    const circles: React.ReactElement[] = [];

    // Render Edges
    if (showEdges) {
      edges.forEach((edge: Edge) => {
        if (edge.ignoreLength) return; // Hide map-segment transition edges

        const traffic = edgeTraffic.get(edgeKey(edge));
        const value = traffic ? (metricMode === "total" ? traffic.total : traffic.collision) : 0;

        const fromNode =
          nodes.find((n: Node) => n.id === edge.from) || controls.find((c: Control) => c.id === edge.from);
        const toNode = nodes.find((n: Node) => n.id === edge.to) || controls.find((c: Control) => c.id === edge.to);

        if (!fromNode || !toNode) return;

        const pos1 = getPos(fromNode);
        const pos2 = getPos(toNode);

        if (typeof pos1.x !== "number" || typeof pos2.x !== "number") return;

        const p1 = toPixels(pos1);
        const p2 = toPixels(pos2);

        // Vector p1 -> p2
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        // Normal vector
        const nx = -dy / len;
        const ny = dx / len;

        const isHeatmap = visualizationMode === "heatmap" || visualizationMode === "both";
        const isThickness = visualizationMode === "thickness" || visualizationMode === "both";

        // Determine Line Properties
        let color: string;
        let width: number;
        let opacity: number;

        if (value === 0) {
          color = "#94a3b8"; // slate-400 - visible but distinct from map
          width = 1.5;
          opacity = 0.6;
        } else {
          // Traffic Visualization
          color = isHeatmap ? getHeatmapColor(value, maxEdgeTraffic) : "#3b82f6"; // Blue default
          // Scale thickness
          width = isThickness ? 2 + (value / (maxEdgeTraffic || 1)) * 10 : 3;
          opacity = 0.8;
        }

        const isSelected = selectedElementId === edgeKey(edge);

        // For now, render simple line with opacity
        lines.push(
          <g
            key={edgeKey(edge)}
            onClick={(e) => {
              e.stopPropagation();
              onElementClick(edgeKey(edge), "edge");
            }}
            className="cursor-pointer hover:opacity-80"
          >
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={color}
              strokeWidth={width}
              strokeOpacity={opacity}
              strokeLinecap="round"
            />
            {/* Value Labels for Selection */}
            {isSelected &&
              (() => {
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;

                // Perpendicular offset distance (e.g. 15px)
                const offset = 15 + width / 2;

                // Unit vectors
                // Direction: (dx/len, dy/len)
                // Normal: (nx, ny) which is (-dy/len, dx/len)

                // For Forward (p1->p2), place "above" or "below"?
                // Let's place Forward at +Normal and Backward at -Normal for now.
                // Or better: Place them such that they are to the "right" of the direction of travel?
                // "Right" side of p1->p2 is (dy, -dx). Which is -Normal.

                // To keep it simple: separate by Normal vector.

                const fX = midX + nx * offset;
                const fY = midY + ny * offset;

                const bX = midX - nx * offset;
                const bY = midY - ny * offset;

                // Arrow Angle
                const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

                return (
                  <g>
                    {/* Forward Label (p1->p2) */}
                    <g transform={`translate(${fX}, ${fY})`}>
                      {/* Small Arrow Pointing Forward */}
                      <g transform={`translate(-8, 0) rotate(${angle})`}>
                        <path d="M -5 -3 L 2 0 L -5 3" fill="black" stroke="white" strokeWidth="1" />
                      </g>
                      <text
                        x={2}
                        y={0}
                        dy={3}
                        fill="black"
                        fontSize="10"
                        fontWeight="bold"
                        textAnchor="start"
                        stroke="white"
                        strokeWidth="2"
                        style={{ paintOrder: "stroke" }}
                      >
                        {traffic?.forward ?? 0}
                      </text>
                    </g>
                    <g transform={`translate(${bX}, ${bY})`}>
                      <g transform={`translate(-8, 0) rotate(${angle + 180})`}>
                        <path d="M -5 -3 L 2 0 L -5 3" fill="black" stroke="white" strokeWidth="1" />
                      </g>
                      <text
                        x={2}
                        y={0}
                        dy={3}
                        fill="black"
                        fontSize="10"
                        fontWeight="bold"
                        textAnchor="start"
                        stroke="white"
                        strokeWidth="2"
                        style={{ paintOrder: "stroke" }}
                      >
                        {traffic?.backward ?? 0}
                      </text>
                    </g>
                  </g>
                );
              })()}
            {/* Highlight Selection */}
            {isSelected && (
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="black"
                strokeWidth={1}
                strokeDasharray="4 2"
                fill="none"
              />
            )}
          </g>,
        );
      });
    }

    // Render Nodes/Controls with traffic
    if (showNodes && metricMode !== "collision") {
      [...nodes, ...controls].forEach((node: Node | Control) => {
        const traffic = nodeTraffic.get(node.id);
        const count = traffic ? traffic.count : 0;

        const pos = getPos(node);
        if (typeof pos.x !== "number" || typeof pos.y !== "number") return;

        const p = toPixels(pos);
        const isHeatmap = visualizationMode === "heatmap" || visualizationMode === "both";
        const isThickness = visualizationMode === "thickness" || visualizationMode === "both";

        let color: string;
        let radius: number;
        let opacity: number;

        if (count === 0) {
          color = "#94a3b8"; // slate-400
          radius = 3;
          opacity = 0.6;
        } else {
          color = isHeatmap ? getHeatmapColor(count, maxNodeTraffic) : "#ef4444";
          radius = isThickness ? 4 + (count / (maxNodeTraffic || 1)) * 10 : 5;
          opacity = 0.9;
        }

        const isSelected = selectedElementId === node.id;

        circles.push(
          <g
            key={node.id}
            onClick={(e) => {
              e.stopPropagation();
              onElementClick(node.id, "node");
            }}
            className="cursor-pointer hover:opacity-80"
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={radius}
              fill={color}
              stroke={isSelected ? "black" : "white"}
              strokeWidth={isSelected ? 2 : 1}
              fillOpacity={opacity}
            />
          </g>,
        );
      });
    }

    return (
      <svg
        ref={svgRef}
        width={state.pdfDimensions.width}
        height={state.pdfDimensions.height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <g style={{ pointerEvents: "auto" }}>
          {lines}
          {circles}
        </g>
      </svg>
    );
  };

  return (
    <MapViewer
      pdfUrl={pdfUrl || undefined}
      showBackgroundMap={showBackgroundMap}
      backgroundOpacity={isMapMuted ? 0.3 : 1}
      onControllerReady={(c) => {
        controllerRef.current = c;
      }}
      onMouseMove={(state) => {
        mapStateRef.current = state;
      }}
    >
      {(state) => renderSvgContent(state)}
    </MapViewer>
  );
});

