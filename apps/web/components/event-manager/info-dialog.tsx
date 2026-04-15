"use client"

import { X, Menu, Plus, FolderOpen, Save, FileUp, FileDown, Settings, Trash2, Info, Copy, RefreshCw, Download } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface EventManagerInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EventManagerInfoDialog({
  isOpen,
  onClose,
}: EventManagerInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";
  const iconClassOnly = "h-3.5 w-3.5 inline-block align-text-bottom";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5" />Event Manager Guide</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto p-6">
          <div className="space-y-5 text-sm text-muted-foreground">

            {/* Introduction */}
            <div>
              <p className="font-medium text-foreground mb-1">Introduction</p>
              <p>
                The Event Manager is your central hub for organizing indoor orienteering competitions.
                It allows you to create and manage events, define courses with different difficulty levels,
                and assign courses to competition classes. All event data including maps, graphs, courses,
                and class assignments are stored together, making it easy to export and share complete event packages.
              </p>
            </div>

            {/* Workflows */}
            <div>
              <p className="font-medium text-foreground mb-2">Common Workflows</p>

              <div className="space-y-3 ml-1">
                {/* Flow 1 */}
                <div className="border border-border rounded-md p-3">
                  <p className="font-medium text-foreground mb-1">Flow 1: Analyse an existing course</p>
                  <p className="mb-1">If you already have a complete event file (JSON) with a map, graph and courses:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Open the event file via <Menu className={iconClassOnly} /> <strong>File &gt; Open</strong> (or load an example)</li>
                    <li>Navigate to <strong>Route Analysis</strong> to see route choices, difficulty and leg details for each course</li>
                    <li>Navigate to <strong>Event Analysis</strong> to visualize traffic heatmaps and collision zones across all courses</li>
                  </ol>
                </div>

                {/* Flow 2 */}
                <div className="border border-border rounded-md p-3">
                  <p className="font-medium text-foreground mb-1">Flow 2: Import existing courses (IOF XML)</p>
                  <p className="mb-1">When you have courses in IOF XML format and want to build the graph for analysis:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Create a new event via <Menu className={iconClassOnly} /> <strong>File &gt; New</strong></li>
                    <li>Import your courses via <Menu className={iconClassOnly} /> <strong>File &gt; Import IOF XML</strong></li>
                    <li>Go to the <strong>Map Properties</strong> tab, load your venue map (PDF)</li>
                    <li>Adjust the map transformation so that control coordinates match the map (use the registration tools)</li>
                    <li>Go to <strong>3D Model</strong> and draw polygons for each floor level, remember to set the level number, elevation and origin point for each floor.</li>
                    <li>Go to <strong>Graph Editor</strong> and build the routing graph:
                      <ul className="list-disc list-inside ml-4 space-y-0.5">
                        <li>Draw staircase nodes and edges first (mark as &quot;ignore length&quot;, and apply labels using the keyboard)</li>
                        <li>Then draw all corridor nodes and edges on each floor</li>
                      </ul>
                    </li>
                    <li>Run <strong>Route Analysis</strong> and <strong>Event Analysis</strong> to evaluate the courses</li>
                  </ol>
                </div>

                {/* Flow 3 */}
                <div className="border border-border rounded-md p-3">
                  <p className="font-medium text-foreground mb-1">Flow 3: Course setting from scratch</p>
                  <p className="mb-1">Create new courses from the ground up:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Create a new event via <Menu className={iconClassOnly} /> <strong>File &gt; New</strong></li>
                    <li>Go to the <strong>Map Properties</strong> tab and load your venue map (PDF)</li>
                    <li>Open the <strong>Course Setting</strong> module to place controls and define courses</li>
                    <li>Go to <strong>Graph Editor</strong> to create the full routing graph for your venue</li>
                    <li>Use <strong>Route Analysis</strong> to evaluate route choices and difficulty</li>
                    <li>Use <strong>Modify Graph</strong> to experiment with blocking passages or making them one-way (experimental!)</li>
                    <li>Iterate on your course design based on the analysis results</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div>
              <p className="font-medium text-foreground mb-1">Toolbar</p>
              <ul className="space-y-1.5 ml-2">
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog</li>
              </ul>
            </div>

            {/* File Menu */}
            <div>
              <p className="font-medium text-foreground mb-1">File Menu (<Menu className={iconClassOnly} />)</p>
              <ul className="space-y-1.5 ml-2">
                <li><Plus className={iconClass} /><strong>New</strong> &mdash; Create a new empty event</li>
                <li><FolderOpen className={iconClass} /><strong>Open...</strong> &mdash; Open an event from a local JSON file</li>
                <li><strong>Examples</strong> &mdash; Load a pre-configured sample event</li>
                <li><strong>Recent Files</strong> &mdash; Quickly re-open previously opened files</li>
                <li><Save className={iconClass} /><strong>Save</strong> &mdash; Save the current event to its file</li>
                <li><Save className={iconClass} /><strong>Save As...</strong> &mdash; Save the event to a new file</li>
                <li><FileUp className={iconClass} /><strong>Import IOF XML...</strong> &mdash; Import courses from IOF XML 3.0 format</li>
                <li><FileDown className={iconClass} /><strong>Export IOF XML...</strong> &mdash; Export courses in IOF XML 3.0 format</li>
                <li><Info className={iconClass} /><strong>About...</strong> &mdash; Go to the landing/about page</li>
                <li><Settings className={iconClass} /><strong>Settings...</strong> &mdash; Open application settings</li>
                <li><X className={iconClass} /><strong>Close</strong> &mdash; Close the current event</li>
              </ul>
            </div>

            {/* Tabs */}
            <div>
              <p className="font-medium text-foreground mb-1">Tabs</p>
              <ul className="space-y-2 ml-2">
                <li>
                  <p className="font-medium text-foreground">Event Properties</p>
                  <p>Configure event details: title, subtitle, date, country, and multi-page map layout (Horizontal, Vertical, or Pages).</p>
                </li>
                <li>
                  <p className="font-medium text-foreground">Map Properties</p>
                  <p>Load and configure the venue map (PDF). Use registration tools to align map coordinates with control positions. Tools include:</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><FolderOpen className={iconClass} /><strong>Browse</strong> &mdash; Load a PDF map file</li>
                    <li><strong>Measure</strong> &mdash; Measure distances on the map</li>
                    <li><strong>Calculate scale</strong> &mdash; Determine the map scale from a known distance</li>
                    <li><strong>Registration tool</strong> &mdash; Align control coordinates to the map by placing two reference points</li>
                  </ul>
                </li>
                <li>
                  <p className="font-medium text-foreground">Courses</p>
                  <p>Manage courses for the event. Each course defines a sequence of controls.</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Plus className={iconClass} /><strong>Add course</strong> &mdash; Create a new course</li>
                    <li><Copy className={iconClass} /><strong>Duplicate</strong> &mdash; Copy an existing course</li>
                    <li><Trash2 className={iconClass} /><strong>Delete</strong> &mdash; Remove a course</li>
                    <li>Click a course name to rename it</li>
                    <li><strong>Target Difficulty</strong> &mdash; Set the intended difficulty level for the course (White, Yellow, Orange, Purple, or Black). This is stored in the event data and can be used to compare against the actual calculated difficulty in Route Analysis.</li>
                  </ul>
                </li>
                <li>
                  <p className="font-medium text-foreground">Class Assignments</p>
                  <p>Assign courses to competition classes and set expected number of competitors per class (used for traffic analysis).</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Plus className={iconClass} /><strong>Add class assignment</strong> &mdash; Add a new class</li>
                    <li><RefreshCw className={iconClass} /><strong>Update course runners</strong> &mdash; Recalculate runner counts per course, based on the number of runners per class</li>
                    <li><Trash2 className={iconClass} /><strong>Delete</strong> &mdash; Remove a class assignment</li>
                  </ul>
                </li>
                <li>
                  <p className="font-medium text-foreground">Controls</p>
                  <p>View a read-only summary of all controls across all courses, including codes, positions and floor levels.</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Download className={iconClass} /><strong>Export CSV</strong> &mdash; Download a CSV file of all controls</li>
                  </ul>
                </li>
              </ul>
            </div>

            {/* Map Layouts */}
            <div>
              <p className="font-medium text-foreground mb-1">Map Layouts</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <span className="font-medium">Horizontal:</span> Use when the map is different on each page (e.g.
                  separate levels/floors).
                </li>
                <li>
                  <span className="font-medium">Pages:</span> Use when the map is the same on each page to avoid drawing
                  the graph edges multiple times (e.g. same level/floor plan repeatedly).
                </li>
              </ul>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
