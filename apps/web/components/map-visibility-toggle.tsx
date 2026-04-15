"use client";

import { EyeOff, Map } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import { cn } from "@indoor-o-route-analysis/core";

export type BackgroundMapMode = "normal" | "muted" | "hidden";

interface MapVisibilityToggleProps {
  // Option 1: Booleans
  showBackgroundMap?: boolean;
  onShowBackgroundMapChange?: (show: boolean) => void;
  isMapMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;

  // Option 2: Direct Mode
  mode?: BackgroundMapMode;
  onModeChange?: (mode: BackgroundMapMode) => void;

  className?: string;
}

export function MapVisibilityToggle({
  showBackgroundMap,
  onShowBackgroundMapChange,
  isMapMuted = false,
  onMuteChange,
  mode,
  onModeChange,
  className,
}: MapVisibilityToggleProps) {
  // Compute background mode: prioritize 'mode' prop, otherwise derive from booleans
  const currentMode: BackgroundMapMode = mode ?? (!showBackgroundMap ? "hidden" : isMapMuted ? "muted" : "normal");

  const handleBackgroundModeClick = () => {
    let nextMode: BackgroundMapMode = "normal";
    
    if (currentMode === "normal") {
      nextMode = "muted";
    } else if (currentMode === "muted") {
      nextMode = "hidden";
    } else {
      nextMode = "normal";
    }

    // Direct mode update
    if (onModeChange) {
      onModeChange(nextMode);
      return;
    }

    // Boolean update fallback
    if (nextMode === "muted") {
       if (onMuteChange) {
           onMuteChange(true);
       } else {
           // Skip muted if not supported
           onShowBackgroundMapChange?.(false);
       }
    } else if (nextMode === "hidden") {
        onShowBackgroundMapChange?.(false);
        onMuteChange?.(false);
    } else {
        // normal
        onShowBackgroundMapChange?.(true);
        onMuteChange?.(false);
    }
  };

  const getBackgroundModeTooltip = () => {
    if (currentMode === "normal") {
      return "Click to dim the background map for better visibility.";
    } else if (currentMode === "muted") {
      return "Click to hide the background map completely.";
    } else {
      return "Click to show the background map at full opacity.";
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", className)}
            onClick={handleBackgroundModeClick}
          >
            {currentMode === "hidden" ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Map className={cn("h-4 w-4", currentMode === "muted" && "opacity-50")} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{getBackgroundModeTooltip()}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
