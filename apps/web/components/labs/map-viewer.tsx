"use client";

import React, { useMemo, useState, useEffect } from "react";
import MapViewer, { type MapViewerState, type MapViewerController, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { useAppData } from "@indoor-o-route-analysis/ui";
import type { MapData } from "@indoor-o-route-analysis/core";
import type { Control } from "@indoor-o-route-analysis/core";
import type { Node, Edge } from "@indoor-o-route-analysis/core";
import { 
  CONTROL_RADIUS, 
  CONTROL_STROKE_WIDTH, 
  COURSE_COLOR,
  LABS_ROUTE_COLOR,
} from "@indoor-o-route-analysis/core";
import { ControlRenderer } from "@indoor-o-route-analysis/ui";

interface LabsMapViewerProps {
  map?: MapData;
  pdfUrl: string | null;
  scale: number;
  displayedRoute?: { path: string[], distance?: number } | null;
  showNodes?: boolean;
  showEdges?: boolean;
  backgroundMode?: "normal" | "muted" | "hidden";
}

// Inner component to handle side-effects and rendering based on MapState
const MapOverlay = ({
  mapState,
  displayedRoute,
  controller,
  nodes,
  controls,
  edges,
  map,
  showNodes,
  showEdges,
}: {
  mapState: MapViewerState,
  displayedRoute?: { path: string[], distance?: number } | null,
  controller: MapViewerController | null,
  nodes: Node[],
  controls: Control[],
  edges: Edge[],
  map: MapData | undefined,
  showNodes?: boolean,
  showEdges?: boolean,
}) => {
  const lastPannedRouteRef = React.useRef<{ path: string[], distance?: number } | null>(null);

  // Fly to the start of the selected leg when it changes
  useEffect(() => {
    // Only fly if we have a controller and a route
    if (!controller || !displayedRoute || displayedRoute.path.length === 0 || !mapState.pixelsPerMM) {
      return;
    }

    // Check if this is a new route selection
    if (lastPannedRouteRef.current === displayedRoute) {
        return;
    }

    // Find the start point (first node/control in the path)
    const startNodeId = displayedRoute.path[0];
    const startNode = nodes.find((n: Node) => n.id === startNodeId);
    const startControl = controls.find((c: Control) => c.id === startNodeId);

    // Extract coordinates: nodes have x/y directly, controls have mapPosition.x/y
    let startMM: { x: number; y: number } | null = null;
    if (startNode && "x" in startNode) {
      startMM = { x: startNode.x, y: startNode.y };
    } else if (startControl?.mapPosition) {
      startMM = { x: startControl.mapPosition.x, y: startControl.mapPosition.y };
    }
    if (!startMM) return;

    lastPannedRouteRef.current = displayedRoute;

    const startPx = eventPosToMultiPagePixels(startMM, map, mapState.pixelsPerMM);
    controller.flyTo(startPx);
  }, [displayedRoute, controller, nodes, controls, map, mapState.pixelsPerMM]);

  // Derived Geometry for rendering
  const { routePolylines, startCircle, endCircle, legLine } = useMemo(() => {
      if (!displayedRoute || displayedRoute.path.length < 2) return {};

      // Helper to get pixel position
      const getPixelPos = (id: string) => {
        const node = nodes.find((n: Node) => n.id === id);
        const control = controls.find((c: Control) => c.id === id);
        if (node && "x" in node && "y" in node) {
            return eventPosToMultiPagePixels({ x: node.x, y: node.y }, map, mapState.pixelsPerMM);
        }
        if (control?.mapPosition) {
            return eventPosToMultiPagePixels({ x: control.mapPosition.x, y: control.mapPosition.y }, map, mapState.pixelsPerMM);
        }
        return null;
      };

      const pathPoints = displayedRoute.path
        .map(id => getPixelPos(id))
        .filter(p => p !== null) as {x: number, y: number}[];
      
      if (pathPoints.length < 2) return {};

      const startPos = pathPoints[0];
      const endPos = pathPoints[pathPoints.length - 1];

      // Styling Constants
      const mainColor = COURSE_COLOR; 
      const routeColor = LABS_ROUTE_COLOR;
      const _shadowStrokeWidth = CONTROL_STROKE_WIDTH + 2.5;
      const strokeWidth = CONTROL_STROKE_WIDTH;

      // Leg Line Calculation (trim start/end to be outside control circles)
      const dx = endPos.x - startPos.x;
      const dy = endPos.y - startPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      let lSx = startPos.x;
      let lSy = startPos.y;
      let lEx = endPos.x;
      let lEy = endPos.y;

      // Only trim if leg is longer than 2 radii (otherwise line would cross itself or be negative)
      if (dist > 2 * CONTROL_RADIUS) {
          const ux = dx / dist;
          const uy = dy / dist;
          
          lSx = startPos.x + ux * CONTROL_RADIUS;
          lSy = startPos.y + uy * CONTROL_RADIUS;
          
          lEx = endPos.x - ux * CONTROL_RADIUS;
          lEy = endPos.y - uy * CONTROL_RADIUS;
      }

      // Leg Line (White halo + Foreground)
      const legLine = (
          <g>
            <line
                x1={lSx} y1={lSy} x2={lEx} y2={lEy}
                stroke="white" strokeWidth={strokeWidth + 4} strokeOpacity={0.8} strokeLinecap="round"
            />
            <line
                x1={lSx} y1={lSy} x2={lEx} y2={lEy}
                stroke={mainColor} strokeWidth={strokeWidth} strokeOpacity={0.8} strokeLinecap="round"
            />
          </g>
      );

      // Render start and end controls using ControlRenderer
      const makeControlWithPos = (id: string, pos: {x: number, y: number}) => {
        const ctrl = controls.find((c: Control) => c.id === id);
        if (ctrl) {
          return { ...ctrl, x: pos.x, y: pos.y };
        }
        // Fallback for node IDs: create a synthetic control
        return { id, type: "control" as const, mapPosition: { x: 0, y: 0 }, x: pos.x, y: pos.y };
      };

      const startId = displayedRoute.path[0];
      const endId = displayedRoute.path[displayedRoute.path.length - 1];
      const startCtrl = makeControlWithPos(startId, startPos);
      const endCtrl = makeControlWithPos(endId, endPos);

      const startCircle = ControlRenderer.renderControl({
        control: startCtrl,
        courseControls: [],
        courseControlCodes: [],
        strokeColor: mainColor,
        showLabel: true,
        label: startCtrl.id,
        showControlPoint: map?.showControlPoints,
      });
      const endCircle = ControlRenderer.renderControl({
        control: endCtrl,
        courseControls: [],
        courseControlCodes: [],
        strokeColor: mainColor,
        showLabel: true,
        label: endCtrl.id,
        showControlPoint: map?.showControlPoints,
      });

      // Route Polyline (handling ignoreLength)
      const segments: { points: {x:number, y:number}[] }[] = [];
      let currentSeg: {x:number, y:number}[] = [];

      for(let i=0; i<displayedRoute.path.length; i++) {
         const nodeId = displayedRoute.path[i];
         const p = getPixelPos(nodeId); 
         if(!p) continue;

         if(i===0) {
             currentSeg.push(p);
             continue;
         }

         const prevNodeId = displayedRoute.path[i-1];
         // Find edge to check ignoreLength
         const edge = edges.find(e => 
             (e.from === prevNodeId && e.to === nodeId) || 
             (!e.oneWay && e.from === nodeId && e.to === prevNodeId)
         );
         
         const isIgnore = edge?.ignoreLength; 

         if(isIgnore) {
             // Finish current segment
             if(currentSeg.length > 0) segments.push({points: currentSeg});
             // Start new segment from THIS node (teleport destination)
             currentSeg = [p];
         } else {
             // Continue segment
             currentSeg.push(p);
         }
      }
      if(currentSeg.length > 0) segments.push({points: currentSeg});

      const routePolylines = (
        <g>
          {segments.map((seg, i) => {
              if (seg.points.length < 2) return null;
              const pts = seg.points.map(p => `${p.x},${p.y}`).join(" ");
              return (
                 <g key={i}>
                    {/* White halo for visibility */}
                    <polyline
                        points={pts}
                        stroke="white"
                        strokeWidth={7}
                        strokeOpacity={0.8}
                        fill="none"
                        strokeDasharray="6,4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    {/* Main dashed green line */}
                    <polyline
                        points={pts}
                        stroke={routeColor}
                        strokeWidth={3}
                        strokeOpacity={0.8}
                        fill="none"
                        strokeDasharray="6,4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                 </g>
              );
          })}
        </g>
      );

      return { routePolylines, startCircle, endCircle, legLine };
  }, [displayedRoute, nodes, controls, edges, map, mapState.pixelsPerMM]);

  // Graph overlay (nodes and edges)
  const graphOverlay = useMemo(() => {
    if (!showNodes && !showEdges) return null;
    if (!mapState.pixelsPerMM) return null;

    const visibleEdges = edges.filter(e => !e.ignoreLength);

    const getPos = (item: Node | Control | undefined) => {
      if (!item) return null;
      if ("x" in item && "y" in item) return eventPosToMultiPagePixels({ x: item.x, y: item.y }, map, mapState.pixelsPerMM);
      if (item.mapPosition) return eventPosToMultiPagePixels({ x: item.mapPosition.x, y: item.mapPosition.y }, map, mapState.pixelsPerMM);
      return null;
    };

    return (
      <g>
        {showEdges && visibleEdges.map((edge, i) => {
          const p1 = getPos(nodes.find(n => n.id === edge.from) || controls.find(c => c.id === edge.from));
          const p2 = getPos(nodes.find(n => n.id === edge.to) || controls.find(c => c.id === edge.to));
          if (!p1 || !p2) return null;
          return (
            <line
              key={`edge-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="rgba(0,0,0,0.2)" strokeWidth={1}
            />
          );
        })}
        {showNodes && nodes.map(node => {
          const p = getPos(node);
          if (!p) return null;
          return (
            <circle key={`node-${node.id}`} cx={p.x} cy={p.y} r={2} fill="rgba(0,0,255,0.3)" />
          );
        })}
        {showNodes && controls.map(control => {
          const p = getPos(control);
          if (!p) return null;
          return (
            <circle key={`ctrl-${control.id}`} cx={p.x} cy={p.y} r={CONTROL_RADIUS * mapState.pixelsPerMM} fill="none" stroke="rgba(128,0,128,0.5)" strokeWidth={CONTROL_STROKE_WIDTH * mapState.pixelsPerMM} />
          );
        })}
      </g>
    );
  }, [showEdges, showNodes, nodes, edges, controls, map, mapState.pixelsPerMM]);

  return (
    <svg
        width={mapState.pdfDimensions.width}
        height={mapState.pdfDimensions.height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
        {graphOverlay}
        {legLine}
        {routePolylines}
        {startCircle}
        {endCircle}
    </svg>
  );
};

export default function LabsMapViewer({
  map,
  pdfUrl,
  scale: _scale,
  displayedRoute,
  showNodes,
  showEdges,
  backgroundMode = "normal",
}: LabsMapViewerProps) {
  const { selectedEvent } = useAppData();
  const [controller, setController] = useState<MapViewerController | null>(null);

  const controls = useMemo(() => selectedEvent?.raceCourses?.[0]?.controls || [], [selectedEvent]);
  const nodes = useMemo(() => selectedEvent?.raceCourses?.[0]?.vertices || [], [selectedEvent]);
  const edges = useMemo(() => selectedEvent?.raceCourses?.[0]?.edges || [], [selectedEvent]);
  const bgOpacity = backgroundMode === "muted" ? 0.3 : backgroundMode === "hidden" ? 0 : 1;

  return (
    <MapViewer
      pdfUrl={pdfUrl || undefined}
      showBackgroundMap={backgroundMode !== "hidden"}
      backgroundOpacity={bgOpacity}
      onControllerReady={setController}
    >
      {(mapState: MapViewerState) => (
        <MapOverlay
          mapState={mapState}
          displayedRoute={displayedRoute}
          controller={controller}
          nodes={nodes}
          controls={controls}
          edges={edges}
          map={map}
          showNodes={showNodes}
          showEdges={showEdges}
        />
      )}
    </MapViewer>
  );
}
