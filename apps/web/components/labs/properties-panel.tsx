"use client"

import { useState, useRef, useEffect } from "react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Progress } from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { RouteAnalyzer, getDifficultyCategory } from "@indoor-o-route-analysis/core";
import type { Node, Control } from "@indoor-o-route-analysis/core";
import { Play, Square, GitCommitHorizontal, Waypoints, Info } from "lucide-react";
import { ScrollArea } from "@indoor-o-route-analysis/ui";
import LabsInfoDialog from "./info-dialog";
import { RouteLabels } from "@/components/route-labels";
import { Toggle } from "@indoor-o-route-analysis/ui";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";

type AnalysisType = "controls" | "nodes";

interface AnalysisResult {
  id: string; // unique id for key
  from: string;
  to: string;
  routeName: string;
  labels: string[];
  length: number;
  time?: number; 
  difficulty: number;
  path: string[];
}

interface LabsPropertiesPanelProps {
  onRouteSelect: (route: { path: string[], distance: number } | null) => void;
  showNodes: boolean;
  setShowNodes: (v: boolean) => void;
  showEdges: boolean;
  setShowEdges: (v: boolean) => void;
  backgroundMode: "normal" | "muted" | "hidden";
  setBackgroundMode: (v: "normal" | "muted" | "hidden") => void;
}

export default function LabsPropertiesPanel({ onRouteSelect, showNodes, setShowNodes, showEdges, setShowEdges, backgroundMode, setBackgroundMode }: LabsPropertiesPanelProps) {
  const { selectedEvent, runningSpeed } = useAppData();
  const [analysisType, setAnalysisType] = useState<AnalysisType>("controls");
  const [topN, setTopN] = useState(50);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [rps, setRps] = useState(0);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any running analysis when the component unmounts (e.g. page navigation)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const runAnalysis = async () => {
    if (!selectedEvent) {
       alert("No event selected.");
       return;
    }

    const controls = selectedEvent.raceCourses?.[0]?.controls || [];
    const nodes = selectedEvent.raceCourses?.[0]?.vertices || [];
    const edges = selectedEvent.raceCourses?.[0]?.edges || [];
    const scale = selectedEvent.raceCourses?.[0]?.maps?.[0]?.scale || 10000;

    if (edges.length === 0) {
       alert("No graph edges found in the selected event. Please create a graph in the Graph Editor first.");
       return;
    }

    if (controls.length === 0 && nodes.length === 0) {
       alert("No graph or controls available.");
       return;
    }

    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsRunning(true);
    setProgress(0);
    setProcessedCount(0);
    setTotalCount(0);
    setRps(0);
    setResults([]);
    onRouteSelect(null);
    setSelectedResultId(null);

    // Initialize Analyzer
    const analyzer = new RouteAnalyzer(controls, nodes, edges, scale, undefined, selectedEvent?.raceCourses?.[0]?.polygons || []);

    const newResults: AnalysisResult[] = [];
    const chunkSize = 5; 
    let processed = 0;
    const startTime = performance.now();

    // Helper to get coords
    const getCoords = (item: Node | Control): {x: number, y: number} | null => {
        if ("mapPosition" in item && item.mapPosition) return item.mapPosition;
        if ("x" in item && "y" in item) return {x: item.x, y: item.y};
        return null;
    };

    try {
        // 1. Generate Candidates
        interface Candidate {
             fromId: string;
             toId: string;
             dist: number;
        }
        const candidates: Candidate[] = [];
        const points = analysisType === "controls" ? controls : nodes;

        for (let i = 0; i < points.length; i++) {
             for (let j = 0; j < points.length; j++) {
                  if (i === j) continue;
                  
                  const p1 = points[i];
                  const p2 = points[j];
                  const c1 = getCoords(p1);
                  const c2 = getCoords(p2);

                  let dist = 0;
                  if (c1 && c2) {
                       const dx = c1.x - c2.x;
                       const dy = c1.y - c2.y;
                       dist = Math.sqrt(dx*dx + dy*dy);
                  }

                  candidates.push({ fromId: p1.id, toId: p2.id, dist });
             }
        }

        // 2. Sort by straight line distance descending
        candidates.sort((a, b) => b.dist - a.dist);

        const totalPairs = candidates.length;
        setTotalCount(totalPairs);

        // 3. Process
        for (let i = 0; i < totalPairs; i++) {
             if (signal.aborted) break;

             const cand = candidates[i];

             try {
                // Determine method based on type
                let alternatives = [];
                if (analysisType === "controls") {
                    alternatives = analyzer.findAlternativePathsBetweenControls(cand.fromId, cand.toId, 1);
                } else {
                    alternatives = analyzer.findAlternativePaths(cand.fromId, cand.toId, 1);
                }

                if (alternatives.length > 0) {
                    const route = alternatives[0];
                    if (Number.isFinite(route.distance) && route.distance > 0) {
                        newResults.push({
                            id: `${cand.fromId}-${cand.toId}`,
                            from: cand.fromId,
                            to: cand.toId,
                            routeName: (route.description || "").replace(/,\s*/g, "") || "Shortest",
                            labels: route.labels || [],
                            length: route.distance,
                            time: route.distance / (runningSpeed || 3.0),
                            difficulty: route.difficulty,
                            path: route.path
                        });
                    }
                }
             } catch (_e) {
                 // console.warn(`Failed to analyze leg ${cand.fromId}-${cand.toId}`, e);
             }

             processed++;

             if (processed % chunkSize === 0) {
                 const now = performance.now();
                 const elapsedSec = (now - startTime) / 1000;
                 const currentRps = elapsedSec > 0 ? processed / elapsedSec : 0;
                 
                 setProgress((processed / totalPairs) * 100);
                 setProcessedCount(processed);
                 setRps(currentRps);
                 
                 newResults.sort((a, b) => b.difficulty - a.difficulty);
                 if (newResults.length > topN * 5) { // Keep buffer
                      newResults.length = topN * 5;
                 }
                 const topResults = newResults.slice(0, topN);
                 setResults([...topResults]);
                 
                 await new Promise(r => setTimeout(r, 0));
             }
        }
        
        if (!signal.aborted) {
            newResults.sort((a, b) => b.difficulty - a.difficulty);
            setResults(newResults.slice(0, topN));
            setProgress(100);
            setProcessedCount(totalPairs);
            
            // Final RPS
            const totalTime = (performance.now() - startTime) / 1000;
            if (totalTime > 0) setRps(totalPairs / totalTime);
        }
    } catch (e) {
        console.error("Analysis failed", e);
        alert("Analysis failed: " + String(e));
    } finally {
        if (!signal.aborted) {
            setIsRunning(false);
            abortControllerRef.current = null;
        }
    }
  };

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsRunning(false);
      }
  };

  const handleRowClick = (res: AnalysisResult) => {
      setSelectedResultId(res.id);
      onRouteSelect({ path: res.path, distance: res.length });
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

      <div className="p-4 border-b border-border space-y-4">
        
        <div className="space-y-2">
            <label className="text-sm font-medium">Analysis Type</label>
            <Select value={analysisType} onValueChange={(v) => setAnalysisType(v as AnalysisType)} disabled={isRunning}>
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="controls">Most Difficult Legs (Controls)</SelectItem>
                    <SelectItem value="nodes">Most Difficult Legs (Nodes)</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div className="space-y-2">
            <label className="text-sm font-medium">Number of routes to show</label>
            <Input 
              type="number" 
              value={topN} 
              onChange={e => setTopN(Math.max(1, parseInt(e.target.value) || 50))} 
              disabled={isRunning}
              min="1"
              max="1000"
            />
        </div>

        <div className="flex gap-2">
             {!isRunning ? (
                 <Button onClick={runAnalysis} className="flex-1 gap-2">
                     <Play className="w-4 h-4" /> Run Analysis
                 </Button>
             ) : (
                 <Button onClick={handleStop} variant="destructive" className="flex-1 gap-2">
                     <Square className="w-4 h-4" /> Stop
                 </Button>
             )}
        </div>
        
        {isRunning && (
            <div className="space-y-1">
                 <Progress value={progress} className="h-2" />
                 <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{processedCount} / {totalCount}</span>
                    <span>{rps.toFixed(1)} rps</span>
                    <span>{Math.round(progress)}%</span>
                 </div>
            </div>
        )}
      </div>

      <ScrollArea className="flex-1 w-full">
          <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground sticky top-0 z-10">
                  <tr className="border-b">
                      <th className="h-10 px-4 text-left font-medium">Leg</th>
                      <th className="h-10 px-4 text-right font-medium">Difficulty</th>
                      <th className="h-10 px-4 text-right font-medium">Length</th>
                  </tr>
              </thead>
              <tbody>
                  {results.map((res) => {
                       const category = getDifficultyCategory(res.difficulty);
                       return (
                           <tr 
                                key={res.id} 
                                className={`border-b transition-colors hover:bg-muted/50 cursor-pointer ${selectedResultId === res.id ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                                onClick={() => handleRowClick(res)}
                            >
                                <td className="p-4 align-middle">
                                    <div className="font-medium">{res.from} → {res.to}</div>
                                    <div className={`mt-0.5 ${selectedResultId === res.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                        <RouteLabels labels={res.labels} />
                                    </div>
                                </td>
                                <td className="p-4 align-middle text-right">
                                    <span className="inline-block px-1.5 py-0.5 rounded text-xs text-white" style={{ backgroundColor: category.color }}>
                                       {res.difficulty.toFixed(1)}
                                    </span>
                                </td>
                                <td className="p-4 align-middle text-right text-xs">
                                    {Math.round(res.length)}m
                                </td>
                           </tr>
                       );
                  })}
                  {results.length === 0 && !isRunning && (
                      <tr>
                          <td colSpan={3} className="p-4 text-center text-muted-foreground h-24">
                              No results. Run analysis to see data.
                          </td>
                      </tr>
                  )}
              </tbody>
          </table>
      </ScrollArea>
      <LabsInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
