"use client"

import { X, Box, Maximize2, Map, EyeOff, Network, Plus, Info, Menu, Copy, Trash2, ArrowLeft, Play, Pause, Square, Target, Layers, PenTool } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface RouteBuilderInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RouteBuilderInfoDialog({
  isOpen,
  onClose,
}: RouteBuilderInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><PenTool className="h-5 w-5" />Route Builder Guide</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto p-6">
          <div className="space-y-5 text-sm text-muted-foreground">

            <div>
              <p className="font-medium text-foreground mb-1">Introduction</p>
              <p>
                Route Builder enables you to record and analyze actual routes taken by competitors,
                or plan custom routes that differ from the calculated optimal path. By adding timing points
                along a route, you can compare real performance against theoretical optimal times,
                analyze mistakes, and understand where time was gained or lost. This is invaluable for
                post-race analysis, training preparation, and understanding route choice consequences.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2">
                <li><Box className={iconClass} /><strong>3D / Map view</strong> &mdash; Switch between the 2D map view and the 3D model view.</li>
                <li><Maximize2 className={iconClass} /><strong>Frame all</strong> &mdash; Reset the camera to frame all geometry (3D mode only).</li>
                <li><Map className={iconClass} /><EyeOff className={iconClass} /><strong>Map visibility</strong> &mdash; Cycle through: full map &rarr; dimmed map &rarr; hidden map.</li>
                <li><Network className={iconClass} /><strong>Show graph</strong> &mdash; Show or hide the underlying graph nodes and edges on the map.</li>
                <li><Plus className={iconClass} /><strong>New route</strong> &mdash; Create a new custom route for a selected course.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
                <li><Menu className={iconClass} /><strong>Menu</strong> &mdash; Additional options:
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><strong>Update legs (from course)</strong> &mdash; Refresh the route legs if the course controls have changed</li>
                    <li><strong>Export GPX</strong> &mdash; Export the selected route as a GPX track file</li>
                    <li><strong>Export video</strong> &mdash; Create an animated video of the route playback</li>
                  </ul>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Playback Controls</p>
              <ul className="space-y-1.5 ml-2">
                <li><Play className={iconClass} /><Pause className={iconClass} /><strong>Play / Pause</strong> &mdash; Start or pause the route animation.</li>
                <li><Square className={iconClass} /><strong>Stop</strong> &mdash; Stop and reset the animation.</li>
                <li><strong>Speed selector</strong> &mdash; Choose playback speed: 1x, 2x, 3x, 4x, 5x, or 10x.</li>
                <li><Layers className={iconClass} /><strong>Hide upper levels</strong> &mdash; In 3D mode, hide floors above the current position.</li>
                <li><Target className={iconClass} /><strong>Follow</strong> &mdash; Keep the animated runner centered in the viewport.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Route Management</p>
              <ul className="space-y-1.5 ml-2">
                <li><Copy className={iconClass} /><strong>Duplicate</strong> &mdash; Create a copy of an existing route to explore variations.</li>
                <li><Trash2 className={iconClass} /><strong>Delete</strong> &mdash; Remove a route permanently.</li>
                <li><ArrowLeft className={iconClass} /><strong>Back</strong> &mdash; Return to the routes list from the route detail view.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Recommended Workflow</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Create a new route by clicking <Plus className={iconClass} />&quot;New Route&quot; and selecting a course</li>
                <li>Select a leg from the leg list in the properties panel</li>
                <li>Click on nodes along the map to add timing points where splits were recorded</li>
                <li>Enter actual times for each timing point in the table</li>
                <li>Repeat for each leg of the course</li>
                <li>Compare the route length and time against the optimal route</li>
                <li>Use duplicate to create variations for comparing different route strategies</li>
                <li>Analyze total time differences to identify where time was gained or lost</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Building a Route Path with Timing Points</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Select a leg from the list in the properties panel</li>
                <li>Click on nodes in the map to add timing points for the selected leg</li>
                <li>Timing points appear as numbered circles on the map and in the timing points table</li>
                <li>The system automatically finds the shortest path from the starting control, through your timing points, to the ending control</li>
                <li>Each timing point gets an interpolated time based on distance at constant speed</li>
                <li>You can edit the time for each timing point in the table</li>
                <li>Click a timing point in the table or on the map to select it</li>
                <li>Press Backspace or Delete to remove the selected timing point</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Route Statistics</p>
              <p>For each leg, you can see:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Route Length:</strong> Total distance of your custom path</li>
                <li><strong>Length Diff:</strong> How much longer/shorter compared to the optimal route</li>
                <li><strong>Route Time:</strong> Estimated time based on length</li>
                <li><strong>Time Diff:</strong> Time difference compared to the optimal route</li>
              </ul>
              <p className="mt-2">The totals at the bottom show aggregate values for the entire route.</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Tips</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Use the duplicate feature to quickly create variations of a route</li>
                <li>You only need to add timing points at key decision points &mdash; the system fills in the shortest path between them</li>
                <li>Use timing points to mark where you want to record split times</li>
                <li>Compare multiple routes for the same course to analyze different strategies</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
