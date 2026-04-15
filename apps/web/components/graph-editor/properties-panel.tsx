"use client"

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Menu,
  Info,
  AlertTriangle,
  Trash2,
  FileUp,
  FileDown,
  MoveHorizontal,
  CheckCircle,
  Crosshair,
  Triangle,
  RefreshCw,
  LineDotRightHorizontal,
  Link,
} from "lucide-react";
import { renameAllNodes } from "@indoor-o-route-analysis/core";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getPageIndexForEventPos } from "@/components/map-viewer";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import GraphEditorInfoDialog from "./info-dialog";
import type { GraphFinding } from "./map-viewer";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { Checkbox } from "@indoor-o-route-analysis/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import { openJsonFilePicker } from "@/lib/file-picker";

import type { SelectedProperties } from "./map-viewer";

interface GraphEditorPropertiesPanelProps {
  properties?: SelectedProperties;
  onPropertiesChange?: (properties: SelectedProperties | null) => void;
  showBackgroundMap: boolean;
  onShowBackgroundMapChange: (show: boolean) => void;
  isMapMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;

  showNormalEdges: boolean;
  showIgnoreEdges: boolean;
  onShowIgnoreEdgesChange: (show: boolean) => void;
  onShowNormalEdgesChange: (show: boolean) => void;
  highlightDeadEnds: boolean;
  onHighlightDeadEndsChange: (highlight: boolean) => void;
  onVerifyGraph: () => void;
  findings: GraphFinding[] | null;
  onSelectFinding: (finding: GraphFinding) => void;
  onDeleteFinding: (finding: GraphFinding) => void;
  onClearGraph: () => void;
  onConnectOverlappingControls: () => number;
}

export default function GraphEditorPropertiesPanel({
  properties,
  onPropertiesChange,
  isMapMuted = false,
  onMuteChange,
  showBackgroundMap,
  showIgnoreEdges,
  onShowIgnoreEdgesChange,
  onShowBackgroundMapChange,
  showNormalEdges,
  onShowNormalEdgesChange,
  highlightDeadEnds,
  onHighlightDeadEndsChange,
  onVerifyGraph,
  findings = null,
  onSelectFinding,
  onDeleteFinding,
  onClearGraph,
  onConnectOverlappingControls,
}: GraphEditorPropertiesPanelProps) {
  const { selectedEvent, updateEventData } = useAppData();
  const isEdgeProperties =
    properties?.type === "edge" && typeof properties?.from === "string" && typeof properties?.to === "string";
  const isNodeProperties = properties?.type === "node";
  const isControlProperties = properties?.type === "control";

  const handleUpdate = (updates: Record<string, unknown>) => {
    if (onPropertiesChange && properties) {
      onPropertiesChange({ ...properties, ...updates } as SelectedProperties);
    }
  };

  // Helper function to download file
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export graph only as JSON
  const exportGraphJSON = useCallback(() => {
    if (!selectedEvent) return;

    const raceCourse = selectedEvent.raceCourses?.[0];
    const controls = raceCourse?.controls || [];
    const vertices = raceCourse?.vertices || [];
    const edges = raceCourse?.edges || [];

    // Combine controls and vertices into a single list of nodes
    const combinedNodes = [
      ...controls.map((c) => ({
        id: c.id,
        x: c.mapPosition.x,
        y: c.mapPosition.y,
        type: "control",
      })),
      ...vertices.map((v) => ({
        id: v.id,
        x: v.x,
        y: v.y,
        type: "node",
      })),
    ];

    const graphData = {
      nodes: combinedNodes,
      edges: edges,
    };

    const json = JSON.stringify(graphData, null, 2);
    downloadFile(
      json,
      `${(selectedEvent.name || "graph").replace(/\s+/g, "_")}_graph_${selectedEvent.id}.json`,
      "application/json",
    );
  }, [selectedEvent]);

  // Export graph as CSV (from,to,weight,label)
  const exportGraphCSV = useCallback(() => {
    if (!selectedEvent) return;

    const raceCourse = selectedEvent.raceCourses?.[0];
    const controls = raceCourse?.controls || [];
    const vertices = raceCourse?.vertices || [];
    const edges = raceCourse?.edges || [];

    // Build a coordinate lookup for all nodes
    const nodeMap = new Map<string, { x: number; y: number }>();
    controls.forEach((c) => nodeMap.set(c.id, c.mapPosition));
    vertices.forEach((v) => nodeMap.set(v.id, { x: v.x, y: v.y }));

    const rows: string[] = ["from,to,weight,label"];

    for (const edge of edges) {
      let weight = 0;
      if (!edge.ignoreLength) {
        const start = nodeMap.get(edge.from);
        const end = nodeMap.get(edge.to);
        if (start && end) {
          weight = Math.hypot(end.x - start.x, end.y - start.y);
        }
      }

      const weightStr = weight.toFixed(1);
      const escapeCSV = (s: string) => {
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      // Forward direction
      rows.push(`${escapeCSV(edge.from)},${escapeCSV(edge.to)},${weightStr},${escapeCSV(edge.label || "")}`);

      // Reverse direction for bidirectional edges
      if (!edge.oneWay) {
        rows.push(`${escapeCSV(edge.to)},${escapeCSV(edge.from)},${weightStr},${escapeCSV(edge.reverseLabel || edge.label || "")}`);
      }
    }

    const csv = rows.join("\n");
    downloadFile(
      csv,
      `${(selectedEvent.name || "graph").replace(/\s+/g, "_")}_graph_${selectedEvent.id}.csv`,
      "text/csv",
    );
  }, [selectedEvent]);

  const handleRenameAllNodes = useCallback(() => {
    if (!selectedEvent) return;
    const raceCourse = selectedEvent.raceCourses?.[0];
    if (!raceCourse) return;

    const vertexCount = (raceCourse.vertices ?? []).length;
    const edgeCount = (raceCourse.edges ?? []).length;
    if (vertexCount === 0 && edgeCount === 0) return;

    if (!confirm(`Rename all ${vertexCount} nodes starting from ID 1000? This cannot be undone.`)) return;

    const { vertices, edges, customRoutes } = renameAllNodes(raceCourse);

    const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
    updatedRaceCourses[0] = { ...raceCourse, vertices, edges, customRoutes };
    updateEventData(selectedEvent.id, { raceCourses: updatedRaceCourses });
  }, [selectedEvent, updateEventData]);

  const importGraphJSON = useCallback(async () => {
    if (!selectedEvent) return;

    try {
      const handle = await openJsonFilePicker();

      if (handle) {
        const file = await handle.getFile();
        const text = await file.text();
        const graphData = JSON.parse(text);

        if (
          !graphData.nodes ||
          !Array.isArray(graphData.nodes) ||
          !graphData.edges ||
          !Array.isArray(graphData.edges)
        ) {
          alert("Invalid graph JSON format. Expected 'nodes' and 'edges' arrays.");
          return;
        }

        // Extract vertices (type === 'node')
        const importedVertices = graphData.nodes
          .filter((n: Record<string, unknown>) => n.type === "node")
          .map((n: Record<string, unknown>) => ({
            id: n.id,
            x: n.x,
            y: n.y,
          }));

        const importedEdges = graphData.edges;

        const currentRaceCourses = selectedEvent.raceCourses || [];
        if (currentRaceCourses.length === 0) {
          alert("No race course found to import graph into.");
          return;
        }

        const raceCourseIndex = 0; // Default targeting first raceCourse as per export
        const raceCourse = currentRaceCourses[raceCourseIndex];

        const updatedRaceCourse = {
          ...raceCourse,
          vertices: importedVertices,
          edges: importedEdges,
        };

        const updatedRaceCourses = [...currentRaceCourses];
        updatedRaceCourses[raceCourseIndex] = updatedRaceCourse;

        await updateEventData(selectedEvent.id, {
          raceCourses: updatedRaceCourses,
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Failed to import graph:", err);
        alert("Failed to import graph.");
      }
    }
  }, [selectedEvent, updateEventData]);

  const stats = useMemo(() => {
    if (!selectedEvent) return null;
    const raceCourse = selectedEvent.raceCourses?.[0];
    if (!raceCourse) return null;

    const { controls = [], vertices = [], edges = [] } = raceCourse;

    // Create map for node coordinates
    const nodeMap = new Map<string, { x: number; y: number }>();
    controls.forEach((c) => nodeMap.set(c.id, c.mapPosition));
    vertices.forEach((v) => nodeMap.set(v.id, { x: v.x, y: v.y }));

    let totalLength = 0;
    let ignoreLengthCount = 0;
    let oneWayCount = 0;

    edges.forEach((edge) => {
      if (edge.ignoreLength) {
        ignoreLengthCount++;
      } else {
        const start = nodeMap.get(edge.from);
        const end = nodeMap.get(edge.to);
        if (start && end) {
          const dx = start.x - end.x;
          const dy = start.y - end.y;
          totalLength += Math.hypot(dx, dy);
        }
      }

      if (edge.oneWay) {
        oneWayCount++;
      }
    });

    return {
      nodeCount: vertices.length,
      controlCount: controls.length,
      edgeCount: edges.length,
      oneWayCount,
      ignoreLengthCount,
      totalLength,
    };
  }, [selectedEvent]);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [selectedFindingIndex, setSelectedFindingIndex] = useState<number | null>(null);

  // Reset selection when findings change
  useEffect(() => {
    setSelectedFindingIndex(null);
  }, [findings]);

  const renderToolbar = () => {
    return (
    <div className="flex items-center justify-between px-2 border-b border-border bg-card h-8">
      <div className="flex items-center gap-1">
        <MapVisibilityToggle
          showBackgroundMap={showBackgroundMap}
          onShowBackgroundMapChange={onShowBackgroundMapChange}
          isMapMuted={isMapMuted}
          onMuteChange={onMuteChange}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showNormalEdges ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onShowNormalEdgesChange(!showNormalEdges)}
              >
                <MoveHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showNormalEdges 
                ? "Hide the normal graph edges from the view." 
                : "Show all normal graph edges on the map."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showIgnoreEdges ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onShowIgnoreEdgesChange(!showIgnoreEdges)}
              >
                <Triangle className="h-4 w-4" strokeDasharray="3 2" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showIgnoreEdges 
                ? "Hide the edges that have 'ignore length' enabled." 
                : "Show edges that have 'ignore length' enabled (e.g., stairs)."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onVerifyGraph}>
                <CheckCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Verify the graph for errors such as disconnected nodes or invalid edges.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={highlightDeadEnds ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onHighlightDeadEndsChange(!highlightDeadEnds)}
              >
                <LineDotRightHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {highlightDeadEnds
                ? "Stop highlighting dead-end edges."
                : "Highlight dead-end paths (edges leading to nodes with no onward route)."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
            <TooltipContent>Open the information guide for graph editor features.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* Hamburger menu for export */}
        <div className="relative">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open the menu for import, export, and graph management options.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {showExportMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50 p-1"
              onMouseLeave={() => setShowExportMenu(false)}
            >
              <button
                onClick={() => {
                  importGraphJSON();
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <FileUp className="mr-2 h-3 w-3" />
                Import Graph JSON
              </button>
              <button
                onClick={() => {
                  exportGraphJSON();
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <FileDown className="mr-2 h-3 w-3" />
                Export Graph JSON
              </button>
              <button
                onClick={() => {
                  exportGraphCSV();
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <FileDown className="mr-2 h-3 w-3" />
                Export Graph CSV
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  handleRenameAllNodes();
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Rename All Nodes
              </button>
              <button
                onClick={() => {
                  const count = onConnectOverlappingControls();
                  alert(count > 0 ? `Added ${count} edge(s) between overlapping controls.` : "No overlapping controls found.");
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <Link className="mr-2 h-3 w-3" />
                Connect Overlapping Controls
              </button>
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to clear all nodes and edges? This cannot be undone.")) {
                    onClearGraph();
                  }
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-destructive hover:text-destructive-foreground text-destructive rounded-sm"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Clear Nodes & Edges
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      {renderToolbar()}
      {/* Properties Section - Scrollable */}
      <div className="flex-1 overflow-auto p-6 pb-0">
        {/* Node Properties */}
        {isNodeProperties && properties?.type === "node" && (() => {
          const nodeProps = properties;
          const mapData = selectedEvent?.raceCourses?.[0]?.maps?.[0];
          const pos = { x: nodeProps.x ?? 0, y: nodeProps.y ?? 0 };
          const pageIndex = getPageIndexForEventPos(pos, mapData);
          const isMultiPage = mapData?.pageTransformMode === "manual" && (mapData?.pageCount ?? 1) > 1;
          return (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{"Node Properties"}</h3>
              <div>
                <Label className="text-xs text-muted-foreground">{"ID"}</Label>
                <Input type="text" disabled value={nodeProps.id || ""} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{"X (mm)"}</Label>
                  <Input
                    type="text"
                    disabled
                    value={typeof nodeProps.x === "number" ? nodeProps.x.toFixed(2) : ""}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{"Y (mm)"}</Label>
                  <Input
                    type="text"
                    disabled
                    value={typeof nodeProps.y === "number" ? nodeProps.y.toFixed(2) : ""}
                    className="mt-1"
                  />
                </div>
              </div>
              {isMultiPage && (
                <div>
                  <Label className="text-xs text-muted-foreground">{"Page"}</Label>
                  <Input type="text" disabled value={String(pageIndex + 1)} className="mt-1" />
                </div>
              )}
            </div>
          );
        })()}

        {/* Control Properties */}
        {isControlProperties && properties?.type === "control" && (() => {
          const ctrlProps = properties;
          const mapData = selectedEvent?.raceCourses?.[0]?.maps?.[0];
          const pos = { x: ctrlProps.mapPosition?.x ?? 0, y: ctrlProps.mapPosition?.y ?? 0 };
          const pageIndex = getPageIndexForEventPos(pos, mapData);
          const isMultiPage = mapData?.pageTransformMode === "manual" && (mapData?.pageCount ?? 1) > 1;
          return (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{"Control Properties"}</h3>
              <div>
                <Label className="text-xs text-muted-foreground">{"ID"}</Label>
                <Input type="text" disabled value={ctrlProps.id || ""} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{"X (mm)"}</Label>
                  <Input
                    type="text"
                    disabled
                    value={typeof ctrlProps.mapPosition?.x === "number" ? ctrlProps.mapPosition.x.toFixed(2) : ""}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{"Y (mm)"}</Label>
                  <Input
                    type="text"
                    disabled
                    value={typeof ctrlProps.mapPosition?.y === "number" ? ctrlProps.mapPosition.y.toFixed(2) : ""}
                    className="mt-1"
                  />
                </div>
              </div>
              {isMultiPage && (
                <div>
                  <Label className="text-xs text-muted-foreground">{"Page"}</Label>
                  <Input type="text" disabled value={String(pageIndex + 1)} className="mt-1" />
                </div>
              )}
            </div>
          );
        })()}

        {/* Edge Properties */}
        {isEdgeProperties && properties?.type === "edge" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{"Edge Properties"}</h3>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{"From"}</Label>
                <Input
                  type="text"
                  disabled
                  value={properties.from || ""}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{"To"}</Label>
                <Input
                  type="text"
                  disabled
                  value={properties.to || ""}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edge-label" className="text-xs text-muted-foreground">
                {"Label"}
              </Label>
              <Input
                id="edge-label"
                type="text"
                placeholder="Enter label"
                value={properties.label || ""}
                onChange={(e) => handleUpdate({ label: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edge-reverse-label" className="text-xs text-muted-foreground">
                {"Reverse Label"}
              </Label>
              <Input
                id="edge-reverse-label"
                type="text"
                placeholder="Enter reverse label"
                value={properties.reverseLabel || ""}
                onChange={(e) => handleUpdate({ reverseLabel: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edge-oneway"
                checked={properties.oneWay || false}
                onCheckedChange={(checked) => handleUpdate({ oneWay: checked })}
                className="border-primary/40 checked:bg-primary checked:border-primary h-5 w-5"
              />
              <Label htmlFor="edge-oneway" className="text-xs text-muted-foreground cursor-pointer">
                {"One-way-passage"}
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edge-teleport"
                checked={properties.ignoreLength || false}
                onCheckedChange={(checked) => handleUpdate({ ignoreLength: checked })}
                className="border-primary/40 checked:bg-primary checked:border-primary h-5 w-5"
              />
              <Label htmlFor="edge-teleport" className="text-xs text-muted-foreground cursor-pointer">
                {"Ignore Length (teleport)"}
              </Label>
            </div>

            <div>
              <Label htmlFor="edge-length" className="text-xs text-muted-foreground">
                {"Edge Length"}
              </Label>
              <Input
                id="edge-length"
                type="text"
                disabled
                value={properties.ignoreLength ? "0 m" : `${(properties.edgeLength || 0).toFixed(1)} m`}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {/* No Selection - Show Help */}
        {!properties && !findings && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <p>Select a node or edge to view properties</p>
          </div>
        )}

        {/* Verified - No Issues */}
        {findings && findings.length === 0 && (
          <div className="mt-6 border-t border-border pt-4 pb-6">
            <div className="flex items-center gap-2 p-3 rounded bg-green-500/10 text-green-600 border border-green-500/20">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Graph verified. No issues.</span>
            </div>
          </div>
        )}

        {/* Findings Section */}
        {findings && findings.length > 0 && (
          <div className="mt-6 border-t border-border pt-4 pb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Validation Findings ({findings.length})</h3>
            <div className="space-y-2">
              {findings.map((finding, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2 p-2 rounded text-xs border group transition-colors cursor-pointer ${
                    selectedFindingIndex === idx
                      ? "bg-purple-500/20 border-purple-500/50"
                      : "bg-muted/50 border-border hover:border-primary/50"
                  }`}
                  onClick={() => {
                    setSelectedFindingIndex(idx);
                    onSelectFinding(finding);
                  }}
                >
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-medium text-foreground">{finding.type}</div>
                    <div className="text-muted-foreground leading-snug break-words">{finding.message}</div>
                  </div>
                  <div className="flex flex-col gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                    {finding.elementId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-muted hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFindingIndex(idx);
                          onSelectFinding(finding);
                        }}
                        title="Find on map"
                      >
                        <Crosshair className="h-3 w-3" />
                      </Button>
                    )}
                    {finding.elementId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFinding(finding);
                          setSelectedFindingIndex(null);
                        }}
                        title="Delete element"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {stats && (
        <div className="border-t border-border p-4 bg-muted/20 text-xs space-y-2">
          <h3 className="font-semibold text-foreground mb-2">Graph Statistics</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <span title="Number of nodes and controls in the graph">Graph order:</span>
            <span className="text-foreground text-right">{stats.nodeCount+stats.controlCount}</span>

            <span title="Number of edges in the graph">Graph size:</span>
            <span className="text-foreground text-right">{stats.edgeCount}</span>

            <span>Nodes:</span>
            <span className="text-foreground text-right">{stats.nodeCount}</span>

            <span>Controls:</span>
            <span className="text-foreground text-right">{stats.controlCount}</span>

            <span>One-way:</span>
            <span className="text-foreground text-right">{stats.oneWayCount}</span>

            <span>Ignore Length:</span>
            <span className="text-foreground text-right">{stats.ignoreLengthCount}</span>

            <span className="font-medium text-foreground pt-1 border-t border-border/50">Total Length:</span>
            <span className="font-medium text-foreground text-right pt-1 border-t border-border/50">
              {stats.totalLength.toFixed(0)} m
            </span>
          </div>
        </div>
      )}

      {/* Info Dialog */}
      <GraphEditorInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
