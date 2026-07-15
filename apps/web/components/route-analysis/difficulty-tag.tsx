"use client"

import React from "react";
import { getDifficultyCategory } from "@indoor-o-route-analysis/core";
import type { ScoringModel } from "@indoor-o-route-analysis/core";
import { cn } from "@indoor-o-route-analysis/ui";

interface DifficultyTagProps {
  difficulty: number;
  className?: string;
  size?: "sm" | "md";
  scoringModel?: ScoringModel;
  isEasiest?: boolean;
}

/**
 * Colored difficulty badge showing only "Dxx" with category colors.
 */
export function DifficultyTag({ difficulty, className, size = "md", scoringModel, isEasiest: _isEasiest }: DifficultyTagProps) {
  const safeDifficulty = Number.isFinite(difficulty) ? Math.round(difficulty) : 0;
  const cat = getDifficultyCategory(difficulty || 0, scoringModel);
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";
  const textSize = size === "sm" ? "text-[11px]" : "text-[12px]";

  return (
    <span
      className={cn("inline-flex items-center rounded font-semibold leading-none gap-1", padding, textSize, className)}
      style={{ backgroundColor: cat.color, color: cat.textColor }}
    >
      <span>D{safeDifficulty}</span>
    </span>
  );
}

// HTML helper for non-React exports (e.g., static report)
export function renderDifficultyTagHTML(difficulty: number, scoringModel?: ScoringModel): string {
  const safeDifficulty = Number.isFinite(difficulty) ? Math.round(difficulty) : 0;
  const cat = getDifficultyCategory(difficulty || 0, scoringModel);
  const bg = cat.color;
  const fg = cat.textColor;
  return `<span style="display:inline-block;background-color:${bg};color:${fg};padding:4px 8px;border-radius:3px;font-weight:bold;white-space:nowrap;">D${safeDifficulty}</span>`;
}
