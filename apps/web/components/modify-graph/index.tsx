"use client"

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getActiveMap } from "@indoor-o-route-analysis/core";
import { usePdfUrl } from "@indoor-o-route-analysis/ui";
import ModifyGraphPropertiesPanel from "./properties-panel";
import type { AnalysisResult } from "./analysis-logic";

// Dynamic import for MapViewer to avoid SSR issues with Leaflet/Canvas
const ModifyGraphMapViewer = dynamic(() => import("./map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});


export default function ModifyGraphPage() {
  const { selectedEvent, selectedCourseId, pdfBlobUrl } = useAppData();

  // State to hold the route to display on the map
  // This is set when the user selects a row in the properties panel
  const [displayedRoute, setDisplayedRoute] = useState<{ path: string[], distance?: number, modification?: AnalysisResult["modification"] } | null>(null);

  // Picking state
  const [pickingTarget, setPickingTarget] = useState<"from" | "to" | null>(null);
  
  // Lifted state for Modify Graph
  const [modifyFrom, setModifyFrom] = useState("");
  const [modifyTo, setModifyTo] = useState("");
  const [excludeStairs, setExcludeStairs] = useState(false);
  
  // Visualization State
  const [showNodes, setShowNodes] = useState(false);
  const [showEdges, setShowEdges] = useState(false);
  const [backgroundMode, setBackgroundMode] = useState<"normal" | "muted" | "hidden">("normal");

  // Original Route (calculated by PropertiesPanel, displayed by MapViewer)
  const [originalRoute, setOriginalRoute] = useState<{ path: string[], difficulty: number } | null>(null);

  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedCourseId);
  const { pdfUrl } = usePdfUrl(activeMap, pdfBlobUrl);

  const [lastPicked, setLastPicked] = useState<{id: string, target: "from"|"to", timestamp: number} | null>(null);

  const handlePick = (id: string) => {
    setLastPicked({ id, target: pickingTarget!, timestamp: Date.now() });
    setPickingTarget(null);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full"> 
       {/* Map View (Left) */}
       <div className="flex-1 flex flex-col relative border-r border-border min-w-0">
          <ModifyGraphMapViewer
            map={activeMap}
            pdfUrl={pdfUrl}
            scale={activeMap?.scale ?? 1000}
            displayedRoute={displayedRoute}
            pickingEnabled={pickingTarget !== null}
            onPick={handlePick}
            
            // New Visualization Props
            showNodes={showNodes}
            showEdges={showEdges}
            backgroundMode={backgroundMode}
            modifyFrom={modifyFrom}
            modifyTo={modifyTo}
            originalRoute={originalRoute}
            excludeStairs={excludeStairs}
          />
       </div>

       {/* Properties Panel (Right) - Widen to 50% more (approx 480px or 30rem) */}
       <div className="w-[30rem] flex flex-col bg-card border-l border-border h-full shrink-0">
         <ModifyGraphPropertiesPanel 
            onRouteSelect={setDisplayedRoute}
            pickingTarget={pickingTarget}
            setPickingTarget={setPickingTarget}
            lastPicked={lastPicked}
            
            // Lifted State
            modifyFrom={modifyFrom}
            setModifyFrom={setModifyFrom}
            modifyTo={modifyTo}
            setModifyTo={setModifyTo}
            excludeStairs={excludeStairs}
            setExcludeStairs={setExcludeStairs}
            
            // Visualization Controls
            showNodes={showNodes}
            setShowNodes={setShowNodes}
            showEdges={showEdges}
            setShowEdges={setShowEdges}
            backgroundMode={backgroundMode}
            setBackgroundMode={setBackgroundMode}
            
            // Result Feedback
            setOriginalRoute={setOriginalRoute}
         />
       </div>
    </div>
  );
}
