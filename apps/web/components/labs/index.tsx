"use client"

import type { LabsDisplayedRoute } from "./displayed-route";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getActiveMap } from "@indoor-o-route-analysis/core";
import { usePdfUrl } from "@indoor-o-route-analysis/ui";
import LabsPropertiesPanel from "./properties-panel";
import type { HumanRouteOverlayState } from "./human-thinking/properties-panel";
import type { ClusteredGraphState } from "./clustered-graph/properties-panel";

// Dynamic import for MapViewer to avoid SSR issues with Leaflet/Canvas
const LabsMapViewer = dynamic(() => import("./map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

export default function LabsPage() {
  const { selectedEvent, selectedCourseId, pdfBlobUrl } = useAppData();

  // State to hold the route to display on the map
  // This is set when the user selects a row in the properties panel
  const [displayedRoute, setDisplayedRoute] = useState<LabsDisplayedRoute | null>(null);
  const [humanRouteOverlay, setHumanRouteOverlay] = useState<HumanRouteOverlayState | null>(null);
  const [clusteredGraph, setClusteredGraph] = useState<ClusteredGraphState | null>(null);

  // Visualization State
  const [showNodes, setShowNodes] = useState(false);
  const [showEdges, setShowEdges] = useState(false);
  const [backgroundMode, setBackgroundMode] = useState<"normal" | "muted" | "hidden">("normal");

  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedCourseId);
  const { pdfUrl } = usePdfUrl(activeMap, pdfBlobUrl);

  return (
    <div className="flex flex-1 overflow-hidden h-full"> 
       {/* Map View (Left) */}
       <div className="flex-1 flex flex-col relative border-r border-border min-w-0">
          <LabsMapViewer
            map={activeMap}
            pdfUrl={pdfUrl}
            scale={activeMap?.scale ?? 1000}
            displayedRoute={displayedRoute}
            humanRouteOverlay={humanRouteOverlay}
            clusteredGraph={clusteredGraph}
            showNodes={showNodes}
            showEdges={showEdges}
            backgroundMode={backgroundMode}
          />
       </div>

       {/* Properties Panel (Right) */}
       <div className="w-80 flex flex-col bg-card border-l border-border h-full shrink-0">
         <LabsPropertiesPanel
            onRouteSelect={setDisplayedRoute}
            onHumanRouteOverlayChange={setHumanRouteOverlay}
            onClusteredGraphChange={setClusteredGraph}
            showNodes={showNodes}
            setShowNodes={setShowNodes}
            showEdges={showEdges}
            setShowEdges={setShowEdges}
            backgroundMode={backgroundMode}
            setBackgroundMode={setBackgroundMode}
         />
       </div>
    </div>
  );
}
