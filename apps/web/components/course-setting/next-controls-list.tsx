"use client"

import { useEffect, useState, useMemo } from "react"
import { RouteAnalyzer, getDifficultyCategory } from "@indoor-o-route-analysis/core"
import { ScoringModelRegistry } from "@indoor-o-route-analysis/core"
import { DifficultyTag } from "@/components/route-analysis/difficulty-tag"
import type { DifficultyCategory } from "@indoor-o-route-analysis/core"
import type { Control } from "@indoor-o-route-analysis/core"
import type { Node } from "@indoor-o-route-analysis/core";
import type { Edge } from "@indoor-o-route-analysis/core";
import { Button } from "@indoor-o-route-analysis/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui"
import { Toggle } from "@indoor-o-route-analysis/ui"
import { Progress } from "@indoor-o-route-analysis/ui";
import { Target, Plus, X } from "lucide-react"

interface NextControlsListProps {
  lastControlId: string
  controls: Control[]
  nodes: Node[]
  edges: Edge[]
  mapScale: number
  scoringModelId?: string
  excludeControlIds: string[]
  onNavigateTo: (controlId: string) => void
  onAddToCourse: (controlCode: string) => void
}

interface AnalyzedControl {
  controlId: string;
  distance: number;
  difficulty: number;
  difficultyCategory: DifficultyCategory;
}

const LENGTH_FILTERS = [
  { id: 'all', label: 'All Lengths' },
  { id: 'short', label: 'Short (<50m)' },
  { id: 'medium', label: 'Medium (50-150m)' },
  { id: 'long', label: 'Long (>150m)' },
] as const

const DIFFICULTY_LEVELS = [
  { id: 'white', label: 'W', color: '#FFFFFF', borderColor: '#e5e5e5' },
  { id: 'yellow', label: 'Y', color: '#FFFF00', borderColor: '#e5e5e5' },
  { id: 'orange', label: 'O', color: '#FF8800', borderColor: 'transparent' },
  { id: 'purple', label: 'P', color: '#8B008B', borderColor: 'transparent' },
  { id: 'black', label: 'B', color: '#000000', borderColor: 'transparent' },
]

export function NextControlsList({ 
  lastControlId, 
  controls,
  nodes,
  edges,
  mapScale,
  scoringModelId,
  excludeControlIds, 
  onNavigateTo, 
  onAddToCourse 
}: NextControlsListProps) {
  const [analyzedControls, setAnalyzedControls] = useState<AnalyzedControl[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0);
  
  // Filters
  const [lengthFilter, setLengthFilter] = useState<string>('all')
  const [difficultyFilters, setDifficultyFilters] = useState<string[]>([])

  const scoringModel = useMemo(() => {
    return scoringModelId ? ScoringModelRegistry.getModel(scoringModelId) : undefined
  }, [scoringModelId])

  useEffect(() => {
    if (!lastControlId) return;

    // Clear previous results when starting new calculation
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset state before async calculation
    setAnalyzedControls([]);

    let isCancelled = false;
    setIsLoading(true);
    setProgress(0);

    const calculateRoutes = async () => {
      // Small delay to allow UI to render loading state
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (isCancelled) return;

      const analyzer = new RouteAnalyzer(controls ?? [], nodes ?? [], edges ?? [], mapScale ?? 1500, scoringModel);

      const lastControl = (controls ?? []).find((c) => c.id === lastControlId);
      if (!lastControl) {
        if (!isCancelled) setIsLoading(false);
        return;
      }

      const potentialControls = (controls ?? []).filter(
        (c) => !excludeControlIds.includes(c.id) && c.id !== lastControlId,
      );

      // Use a local variable to accumulate results for sorting context
      const currentResults: AnalyzedControl[] = [];
      const BATCH_SIZE = 1;

      for (let i = 0; i < potentialControls.length; i += BATCH_SIZE) {
        if (isCancelled) return;

        const batch = potentialControls.slice(i, i + BATCH_SIZE);

        for (const targetControl of batch) {
          try {
            const routes = analyzer.findAlternativePathsBetweenControls(lastControl.id, targetControl.id, 1);
            if (routes.length > 0) {
              const difficulty = routes[0].difficulty;
              const newResult = {
                controlId: targetControl.id,
                distance: routes[0].distance,
                difficulty: difficulty,
                difficultyCategory: getDifficultyCategory(difficulty, scoringModel),
              };
              currentResults.push(newResult);
            }
          } catch (e) {
            console.error(`Error calculating route to ${targetControl.id}`, e);
          }
        }

        if (!isCancelled) {
          // Sort continuously so the list looks stable and ordered
          currentResults.sort((a, b) => a.distance - b.distance);
          // Create a new array reference to trigger re-render
          setAnalyzedControls([...currentResults]);
          setProgress(Math.round(((i + batch.length) / potentialControls.length) * 100));
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (!isCancelled) {
        setIsLoading(false);
      }
    };

    calculateRoutes();

    return () => {
      isCancelled = true;
    };
  }, [controls, nodes, edges, mapScale, lastControlId, excludeControlIds, scoringModel])


  const filteredControls = useMemo(() => {
    return analyzedControls.filter(control => {
      // Length filter
      if (lengthFilter === 'short' && control.distance > 50) return false;
      if (lengthFilter === 'medium' && (control.distance <= 50 || control.distance > 150)) return false;
      if (lengthFilter === 'long' && control.distance <= 150) return false;

      // Difficulty filter
      if (difficultyFilters.length > 0) {
        if (!difficultyFilters.includes(control.difficultyCategory.name)) return false;
      }

      return true;
    });
  }, [analyzedControls, lengthFilter, difficultyFilters]);

  const toggleDifficultyFilter = (levelId: string) => {
    setDifficultyFilters(prev => 
      prev.includes(levelId) 
        ? prev.filter(id => id !== levelId)
        : [...prev, levelId]
    )
  }

  // if (analyzedControls.length === 0) return <div className="text-xs text-muted-foreground p-2 text-center">No accessible controls found</div>

  return (
    <div className="mt-4 flex flex-col min-h-0 bg-card">
      <div className="flex items-center justify-between mb-2 px-4">
        <h3 className="text-sm font-semibold">Next Leg Suggestions</h3>
        {(lengthFilter !== "all" || difficultyFilters.length > 0) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => {
              setLengthFilter("all");
              setDifficultyFilters([]);
            }}
            title="Clear filters"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="px-4 mb-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex justify-between">
              <span>Finding routes...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1" />
          </div>
        </div>
      )}

      <div className="space-y-2 mb-2 px-4">
        {/* Length Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground w-12 font-semibold">Length</span>
          <Select value={lengthFilter} onValueChange={setLengthFilter}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LENGTH_FILTERS.map((f) => (
                <SelectItem key={f.id} value={f.id} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Difficulty Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground w-12 font-semibold">Diff</span>
          <div className="flex gap-1 flex-1">
            {DIFFICULTY_LEVELS.map((level) => {
              const isSelected = difficultyFilters.includes(level.id);
              // Determine text color based on background luminance for better contrast
              // Simple heuristic: Black and Purple need white text, others black
              const textColor = ["black", "purple"].includes(level.id) ? "white" : "black";

              return (
                <Toggle
                  key={level.id}
                  size="sm"
                  pressed={isSelected}
                  onPressedChange={() => toggleDifficultyFilter(level.id)}
                  className={`h-6 w-6 p-0 border transition-all ${isSelected ? "ring-2 ring-primary ring-offset-1" : "opacity-70 hover:opacity-100"}`}
                  style={{
                    backgroundColor: level.color,
                    borderColor: level.borderColor,
                    color: textColor,
                  }}
                  title={`Filter ${level.id}`}
                >
                  <span className="text-[10px] font-bold">{level.label}</span>
                </Toggle>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-y-auto border-y border-border min-h-[100px] max-h-[300px]">
        {filteredControls.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 text-center">
            {analyzedControls.length === 0 ? "No available controls" : "No controls match filters"}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Code</th>
                <th className="px-2 py-1 text-right font-medium">Dist</th>
                <th className="px-2 py-1 text-center font-medium">Diff</th>
                <th className="px-2 py-1 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredControls.map((control) => {
                const _diffCat = control.difficultyCategory;
                return (
                  <tr
                    key={control.controlId}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => onNavigateTo(control.controlId)}
                  >
                    <td className="px-2 py-1 font-mono">{control.controlId}</td>
                    <td className="px-2 py-1 text-right">{Math.round(control.distance)} m</td>
                    <td className="px-2 py-1 text-center">
                      <DifficultyTag difficulty={control.difficulty} size="sm" scoringModel={scoringModel} />
                    </td>
                    <td className="px-2 py-1 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Navigate to control"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateTo(control.controlId);
                        }}
                      >
                        <Target className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:text-primary"
                        title="Add to course"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToCourse(control.controlId);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
