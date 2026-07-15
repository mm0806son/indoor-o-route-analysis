"use client"

import { useState } from "react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { GitCommitHorizontal, Waypoints, Info } from "lucide-react";
import LabsInfoDialog from "./info-dialog";
import { Toggle } from "@indoor-o-route-analysis/ui";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import MostDifficultLegsPanel from "./most-difficult-legs/properties-panel";
import HumanThinkingPanel, { type HumanRouteOverlayState } from "./human-thinking/properties-panel";
import ClusteredGraphPanel, { type ClusteredGraphState } from "./clustered-graph/properties-panel";

type Lab = "most-difficult-controls" | "most-difficult-nodes" | "human-thinking" | "clustered-graph";

interface LabsPropertiesPanelProps {
  onRouteSelect: (route: { path: string[], distance: number, fromLabel?: string, toLabel?: string, forwardSegmentCount?: number } | null) => void;
  onHumanRouteOverlayChange?: (overlay: HumanRouteOverlayState | null) => void;
  onClusteredGraphChange?: (state: ClusteredGraphState | null) => void;
  showNodes: boolean;
  setShowNodes: (v: boolean) => void;
  showEdges: boolean;
  setShowEdges: (v: boolean) => void;
  backgroundMode: "normal" | "muted" | "hidden";
  setBackgroundMode: (v: "normal" | "muted" | "hidden") => void;
}

export default function LabsPropertiesPanel({ onRouteSelect, onHumanRouteOverlayChange, onClusteredGraphChange, showNodes, setShowNodes, showEdges, setShowEdges, backgroundMode, setBackgroundMode }: LabsPropertiesPanelProps) {
  const [lab, setLab] = useState<Lab>("most-difficult-controls");
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  // Switching labs starts each one fresh — no state leaks between them.
  const handleLabChange = (value: Lab) => {
    setLab(value);
    onRouteSelect(null);
    onHumanRouteOverlayChange?.(null);
    onClusteredGraphChange?.(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Visual Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle pressed={showNodes} onPressedChange={setShowNodes} size="sm" aria-label="Toggle Nodes">
                   <GitCommitHorizontal className="w-4 h-4" />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {showNodes
                  ? "Hide the graph nodes from the map view."
                  : "Show all graph nodes on the map."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle pressed={showEdges} onPressedChange={setShowEdges} size="sm" aria-label="Toggle Edges">
                   <Waypoints className="w-4 h-4" />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {showEdges
                  ? "Hide the graph edges from the map view."
                  : "Show all graph edges on the map."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="w-px h-4 bg-border mx-1" />
          <MapVisibilityToggle
            mode={backgroundMode}
            onModeChange={setBackgroundMode}
            className="h-8 w-8"
          />
          <div className="flex-1" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowInfoDialog(true)}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open the Labs information guide.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
      </div>

      <div className="p-4 border-b border-border space-y-2">
        <Select value={lab} onValueChange={(v) => handleLabChange(v as Lab)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="most-difficult-controls">Most difficult legs (controls)</SelectItem>
            <SelectItem value="most-difficult-nodes">Most difficult legs (nodes)</SelectItem>
            <SelectItem value="human-thinking">Human thinking simulation</SelectItem>
            <SelectItem value="clustered-graph">Clustered graph</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {lab === "most-difficult-controls" && (
          <MostDifficultLegsPanel mode="controls" onRouteSelect={onRouteSelect} />
        )}
        {lab === "most-difficult-nodes" && (
          <MostDifficultLegsPanel mode="nodes" onRouteSelect={onRouteSelect} />
        )}
        {lab === "human-thinking" && (
          <HumanThinkingPanel onRouteSelect={onRouteSelect} onOverlayChange={onHumanRouteOverlayChange} />
        )}
        {lab === "clustered-graph" && (
          <ClusteredGraphPanel onClusteredGraphChange={onClusteredGraphChange} />
        )}
      </div>

      <LabsInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
