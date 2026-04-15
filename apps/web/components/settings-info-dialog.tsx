"use client"

import { X, Settings } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface SettingsInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsInfoDialog({
  isOpen,
  onClose,
}: SettingsInfoDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5" />Settings Guide</h2>
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
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">General Settings</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Auto-save</p>
              <p>
                When enabled, the current event file is automatically saved to disk every 5 minutes.
                This helps prevent data loss during long editing sessions. Auto-save only applies when
                working with a file that has already been saved at least once.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Persist to Local DB</p>
              <p>
                Stores your current work in the browser&apos;s local IndexedDB storage. This allows you to
                recover your session if the browser is accidentally closed or refreshed. The data is
                stored only in your browser and is not sent to any server.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Running Speed</p>
              <p>
                The average running speed used to estimate leg and course completion times in route
                analysis. Adjust this to match the expected pace of your target competitor group.
                The value is specified in meters per second (m/s), with the equivalent pace shown
                in minutes per kilometer.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Map Cache</p>
              <p>
                Loaded PDF maps are cached in the browser&apos;s IndexedDB for faster subsequent loads.
                The cache size is displayed here. Use the Clear button to free up storage space if
                needed — maps will be re-cached when loaded again.
              </p>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="font-medium text-foreground mb-1">Feature Flags</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Route Builder</p>
              <p>
                Enables the Route Builder tool, which allows you to manually draw routes on the map
                by clicking through graph nodes. Useful for comparing hand-drawn routes against
                computed optimal routes.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Labs</p>
              <p>
                Enables the Labs section, which provides access to experimental and in-development
                features. These features may be incomplete or change without notice.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Modify Graph</p>
              <p>
                Enables graph modification tools that allow batch operations on the routing graph,
                such as automated transformations and bulk edits. Use with caution as these
                operations can make large-scale changes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
