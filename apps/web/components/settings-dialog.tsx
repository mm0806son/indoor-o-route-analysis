"use client"

import { useState, useEffect } from "react";
import { X, Clock, Database, Trash2, Zap, FlaskConical, PenTool, Pickaxe, Info, Route } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Switch } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { getCacheSize, clearCache } from "@indoor-o-route-analysis/core";
import { useFeatureFlags } from "@indoor-o-route-analysis/ui";
import SettingsInfoDialog from "@/components/settings-info-dialog";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  autoSaveEnabled: boolean;
  onAutoSaveChange: (checked: boolean) => void;
  persistToDB: boolean;
  onPersistToDBChange: (checked: boolean) => void;
  runningSpeed: number;
  onRunningSpeedChange: (speed: number) => void;
  routeAnalysisK: number;
  onRouteAnalysisKChange: (k: number) => void;
}

type SettingsTab = "general" | "features" | "analysis";

export default function SettingsDialog({
  isOpen,
  onClose,
  autoSaveEnabled,
  onAutoSaveChange,
  persistToDB,
  onPersistToDBChange,
  runningSpeed,
  onRunningSpeedChange,
  routeAnalysisK,
  onRouteAnalysisKChange,
}: SettingsDialogProps) {
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const { flags, updateFlag } = useFeatureFlags();

  useEffect(() => {
    if (isOpen) {
      getCacheSize().then(setCacheSize).catch(console.error);
    }
  }, [isOpen]);

  const handleClearCache = async () => {
    if (confirm("Are you sure you want to clear the map cache? Maps will need to be reloaded.")) {
      try {
        await clearCache();
        setCacheSize(0);
      } catch (error) {
        console.error("Failed to clear cache:", error);
        alert("Failed to clear cache");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-sm w-full mx-4 shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-md font-semibold">Settings</h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowInfoDialog(true)} title="Show settings guide">
              <Info className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "general"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("general")}
          >
            General
          </button>
          <button
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "features"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("features")}
          >
            Feature Flags
          </button>
          <button
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "analysis"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("analysis")}
          >
            Analysis
          </button>
        </div>

        {activeTab === "general" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Auto-save</span>
                <span className="text-xs text-muted-foreground">Save to file every 5 minutes</span>
              </div>
            </div>
            <Switch checked={autoSaveEnabled} onCheckedChange={onAutoSaveChange} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Database className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Persist to local DB</span>
                <span className="text-xs text-muted-foreground">Save changes to browser storage</span>
              </div>
            </div>
            <Switch checked={persistToDB} onCheckedChange={onPersistToDBChange} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="whitespace-nowrap">Running Speed</span>
                <span className="text-xs text-muted-foreground">Used for time estimations</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="h-7 w-20 text-right"
                    value={runningSpeed}
                    onChange={(e) => onRunningSpeedChange(parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-xs text-muted-foreground w-6">m/s</span>
                </div>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {runningSpeed > 0
                    ? (() => {
                        const secPerKm = 1000 / runningSpeed;
                        const m = Math.floor(secPerKm / 60);
                        const s = Math.round(secPerKm % 60);
                        return `${m}:${s.toString().padStart(2, "0")} min/km`;
                      })()
                    : "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex flex-col gap-1 w-full">
              <span className="text-sm font-medium">Map Cache</span>
              <div className="flex items-center justify-between">
                 <span className="text-xs text-muted-foreground">
                  {cacheSize !== null ? `${(cacheSize / 1024 / 1024).toFixed(2)} MB used` : "Calculating..."}
                </span>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleClearCache}
                  className="text-xs h-7 px-2"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
        )}

        {activeTab === "features" && (
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground mb-4">
            Enable or disable experimental features. Changes take effect immediately.
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <PenTool className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Route Builder</span>
                <span className="text-xs text-muted-foreground">Manual route drawing tool</span>
              </div>
            </div>
            <Switch 
              checked={flags.routeBuilder} 
              onCheckedChange={(checked) => updateFlag("routeBuilder", checked)} 
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Labs</span>
                <span className="text-xs text-muted-foreground">Experimental features</span>
              </div>
            </div>
            <Switch 
              checked={flags.labs} 
              onCheckedChange={(checked) => updateFlag("labs", checked)} 
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Pickaxe className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Modify Graph</span>
                <span className="text-xs text-muted-foreground">Graph modification tools</span>
              </div>
            </div>
            <Switch 
              checked={flags.modifyGraph} 
              onCheckedChange={(checked) => updateFlag("modifyGraph", checked)} 
            />
          </div>
        </div>
        )}
        {activeTab === "analysis" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Route className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Max routes (k)</span>
                <span className="text-xs text-muted-foreground">Alternative routes per leg</span>
              </div>
            </div>
            <Input
              type="number"
              min="1"
              max="1000"
              step="1"
              className="h-7 w-20 text-right"
              value={routeAnalysisK}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 1000) {
                  onRouteAnalysisKChange(val);
                }
              }}
            />
          </div>
        </div>
        )}
      </div>
      <SettingsInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
