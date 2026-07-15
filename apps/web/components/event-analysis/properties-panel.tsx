"use client"

import React, { useMemo, useState } from "react";
import { Download, Menu, Share2, CircleDot, Info } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { Separator } from "@indoor-o-route-analysis/ui";
import { RadioGroup, RadioGroupItem } from "@indoor-o-route-analysis/ui";
import { Progress } from "@indoor-o-route-analysis/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@indoor-o-route-analysis/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import type { EdgeTraffic, NodeTraffic } from "./analysis-logic";
import EventAnalysisInfoDialog from "./info-dialog";

interface EventAnalysisPropertiesPanelProps {
  // Course selection
  targetCourseId: string | null;
  setTargetCourseId: (id: string | null) => void;

  visualizationMode: "heatmap" | "thickness" | "both";
  setVisualizationMode: (mode: "heatmap" | "thickness" | "both") => void;
  metricMode: "total" | "collision";
  setMetricMode: (mode: "total" | "collision") => void;
  selectedElementId: string | null;
  selectedElementType: "edge" | "node" | null;
  edgeTraffic: Map<string, EdgeTraffic>;
  nodeTraffic: Map<string, NodeTraffic>;
  onCloseSelection?: () => void;
  // Toolbar props
  showEdges: boolean;
  setShowEdges: (v: boolean) => void;
  showNodes: boolean;
  setShowNodes: (v: boolean) => void;
  showBackgroundMap: boolean;
  setShowBackgroundMap: (v: boolean) => void;
  isMapMuted: boolean;
  setIsMapMuted: (v: boolean) => void;
  isAnalyzing: boolean;
  progress: number;
  onExportImage: () => void;
  onExportPdf: () => void;
}

export default function EventAnalysisPropertiesPanel({
  targetCourseId,
  setTargetCourseId,
  visualizationMode,
  setVisualizationMode,
  metricMode,
  setMetricMode,
  selectedElementId,
  selectedElementType,
  edgeTraffic,
  nodeTraffic,
  onCloseSelection: _onCloseSelection,
  showEdges,
  setShowEdges,
  showNodes,
  setShowNodes,
  showBackgroundMap,
  setShowBackgroundMap,
  isMapMuted,
  setIsMapMuted,
  isAnalyzing,
  progress,
  onExportImage,
  onExportPdf
}: EventAnalysisPropertiesPanelProps) {
  const { selectedEvent } = useAppData();
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  const totalRunners = useMemo(() => {
    return (
      selectedEvent?.raceCourses?.[0]?.courses?.reduce((acc, c) => acc + (c.numberOfCompetitors || 0), 0) ||
      0
    );
  }, [selectedEvent]);

  const courses = useMemo(() => {
    return selectedEvent?.raceCourses?.[0]?.courses?.filter(c => (c.numberOfCompetitors || 0) > 0) || [];
  }, [selectedEvent]);

  const selectedStats = useMemo(() => {
    if (!selectedElementId) return null;
    if (selectedElementType === "edge") {
      return edgeTraffic.get(selectedElementId) || null;
    } else if (selectedElementType === "node") {
      return nodeTraffic.get(selectedElementId) || null;
    }
    return null;
  }, [selectedElementId, selectedElementType, edgeTraffic, nodeTraffic]);

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      <div className="flex items-center justify-between px-2 border-b border-border bg-card h-8">
        <div className="flex items-center gap-1">
          {/* Toolbar */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showEdges ? "active" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowEdges(!showEdges)}
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showEdges 
                  ? "Hide the edge traffic visualization from the map." 
                  : "Show the edge traffic visualization as a heatmap or thickness."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showNodes ? "active" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowNodes(!showNodes)}
                  disabled={metricMode === "collision"}
                >
                  <CircleDot className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showNodes 
                  ? "Hide the node traffic circles from the map." 
                  : "Show node traffic as colored circles indicating runner frequency."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <MapVisibilityToggle
            showBackgroundMap={showBackgroundMap}
            onShowBackgroundMapChange={setShowBackgroundMap}
            isMapMuted={isMapMuted}
            onMuteChange={setIsMapMuted}
          />
        </div>
        <div className="flex items-center gap-1">
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
              <TooltipContent>Open the information guide for event traffic analysis.</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Menu className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onExportImage}>
                      <Download className="h-4 w-4 mr-2" />
                      Export PNG
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onExportPdf}>
                      <Download className="h-4 w-4 mr-2" />
                      Export PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent>Open the menu for export options.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {isAnalyzing && (
        <div className="px-6 pt-4 pb-2">
          <div className="flex flex-col gap-1 w-full">
            <span className="text-xs text-muted-foreground">Analyzing... {Math.round(progress)}%</span>
            <Progress value={progress} className="h-1" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 pb-0">
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Analysis Scope</h3>
            <div className="space-y-2">
              <Select
                value={targetCourseId || "all"}
                onValueChange={(v) => setTargetCourseId(v === "all" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All courses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All courses ({totalRunners} runners)</SelectItem>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name} ({course.numberOfCompetitors || 0} runners)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Visualization</h3>
            <RadioGroup
              value={visualizationMode}
              onValueChange={(v) => setVisualizationMode(v as "heatmap" | "thickness" | "both")}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="heatmap" id="mode-heatmap" />
                <Label htmlFor="mode-heatmap" className="text-xs">
                  Heatmap
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="thickness" id="mode-thickness" />
                <Label htmlFor="mode-thickness" className="text-xs">
                  Thickness/diameter
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="both" id="mode-both" />
                <Label htmlFor="mode-both" className="text-xs">
                  Both
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Metric</h3>
            <RadioGroup value={metricMode} onValueChange={(v) => setMetricMode(v as "total" | "collision")} className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="total" id="metric-total" />
                <Label htmlFor="metric-total" className="text-xs">
                  Total runners
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="collision" id="metric-collision" />
                <Label htmlFor="metric-collision" className="text-xs">
                  Collision potential
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {selectedElementId && selectedStats ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Selected {selectedElementType === "edge" ? "Edge" : "Node"}
                </h3>
              </div>

              {selectedElementType === "edge" ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Total Traffic:</span>
                    <span className="font-bold text-right">{(selectedStats as EdgeTraffic).total}</span>

                    <span className="text-muted-foreground">Forward:</span>
                    <span className="text-right">{(selectedStats as EdgeTraffic).forward}</span>

                    <span className="text-muted-foreground">Backward:</span>
                    <span className="text-right">{(selectedStats as EdgeTraffic).backward}</span>

                    <span className="text-muted-foreground">Collision potential:</span>
                    <span className="font-bold text-orange-500 text-right">
                      {(selectedStats as EdgeTraffic).collision}
                    </span>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground mb-2">Used in Courses</h3>
                    {selectedStats && selectedStats.courseIds && selectedStats.courseIds.size > 0 ? (
                      <div className="text-sm space-y-1">
                        {Array.from(selectedStats.courseIds)
                          .sort()
                          .map((courseName) => (
                            <div key={courseName} className="text-muted-foreground">
                              • {courseName}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">None</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Visits:</span>
                  <span className="font-bold text-right">{(selectedStats as NodeTraffic).count}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              Click on an edge or node to view details
            </div>
          )}
        </div>
        <div className="pb-6" />
      </div>

      <EventAnalysisInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
