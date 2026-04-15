"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

const STORAGE_KEY = "preview-warning-dismissed-v1"; // v1 in case we want to show it again later for a major update
const DISMISS_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function PreviewWarning() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check local storage to see if message should be shown
    const dismissedAtStr = localStorage.getItem(STORAGE_KEY);
    
    if (!dismissedAtStr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial visibility check on mount
      setVisible(true);
      return;
    }

    const dismissedAt = parseInt(dismissedAtStr, 10);
    const now = Date.now();
    
    // If more than 30 days have passed since dismissal, show it again
    if (now - dismissedAt > DISMISS_PERIOD_MS) {
       
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="w-full bg-red-950 border-b border-red-900 text-red-400 px-4 py-1 text-xs flex items-center justify-between">
      <div className="flex-1 text-left font-medium">
        This is a proof-of-concept application. It may be unstable and all features may not work properly.
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 ml-2 text-red-400 hover:bg-red-900 hover:text-red-300"
        onClick={handleDismiss}
        aria-label="Dismiss warning"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
