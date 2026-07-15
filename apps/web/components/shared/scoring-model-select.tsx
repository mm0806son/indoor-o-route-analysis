"use client";

import { useMemo } from "react";
import { ScoringModelRegistry } from "@indoor-o-route-analysis/core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";

export interface ScoringModelSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /** Applied to SelectTrigger; defaults to the compact style used across the app's scoring-model pickers. */
  className?: string;
  /** Prepends an extra option (e.g. "None" for an optional secondary/comparison selector). */
  extraOption?: { value: string; label: string };
  /** Model ids to leave out of the list, e.g. the primary selection in a "compare with" secondary selector. */
  excludeIds?: string[];
}

/** Dropdown listing every registered scoring model (name + version), shared by the route-analysis properties panel and the all-courses comparison dialog. */
export function ScoringModelSelect({
  value,
  onValueChange,
  disabled,
  className = "h-8 text-xs",
  extraOption,
  excludeIds = [],
}: ScoringModelSelectProps) {
  const availableScoringModels = useMemo(() => ScoringModelRegistry.getAllModels(), []);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={extraOption?.label} />
      </SelectTrigger>
      <SelectContent>
        {extraOption && (
          <SelectItem value={extraOption.value} className="text-xs">
            {extraOption.label}
          </SelectItem>
        )}
        {availableScoringModels
          .filter((model) => !excludeIds.includes(model.getFullId()))
          .map((model) => (
            <SelectItem key={model.getFullId()} value={model.getFullId()} className="text-xs">
              {model.name} v{model.version}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
