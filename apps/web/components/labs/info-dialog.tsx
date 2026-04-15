"use client"

import { X, GitCommitHorizontal, Waypoints, Map, EyeOff, Info, Play, Square, FlaskConical } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface LabsInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LabsInfoDialog({
  isOpen,
  onClose,
}: LabsInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><FlaskConical className="h-5 w-5" />Labs Guide</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto p-6">
          <div className="space-y-5 text-sm text-muted-foreground">

            <div>
              <p className="font-medium text-foreground mb-1">Introduction</p>
              <p>
                The Labs page is an experimental workspace for analyzing route difficulty across your venue&apos;s graph.
                It computes the most difficult legs between controls or graph nodes using Dijkstra&apos;s shortest path algorithm,
                then ranks and displays them so you can identify challenging route segments at a glance.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Analysis Types</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Most Difficult Legs (Controls):</strong> Analyzes routes between all pairs of controls and ranks them by difficulty score.</li>
                <li><strong>Most Difficult Legs (Nodes):</strong> Analyzes routes between all pairs of graph nodes, providing a broader view of difficult segments across the entire venue.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2">
                <li><GitCommitHorizontal className={iconClass} /><strong>Nodes</strong> &mdash; Show or hide graph nodes on the map.</li>
                <li><Waypoints className={iconClass} /><strong>Edges</strong> &mdash; Show or hide graph edges on the map.</li>
                <li><Map className={iconClass} /><EyeOff className={iconClass} /><strong>Map visibility</strong> &mdash; Cycle through: full map &rarr; dimmed map &rarr; hidden map.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Running an Analysis</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Select an analysis type (Controls or Nodes).</li>
                <li>Set the number of top routes to display.</li>
                <li>Click <Play className={iconClass} /><strong>Run Analysis</strong> to start. Progress is shown during computation.</li>
                <li>Click <Square className={iconClass} /><strong>Stop</strong> at any time to abort.</li>
                <li>Results appear sorted by difficulty. Click any row to visualize that route on the map.</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Results Table</p>
              <p>
                Each row shows the start and end points, the route name with labels, the leg length,
                estimated time, and a difficulty score with a color-coded category badge.
                Click a row to highlight the corresponding route on the map.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
