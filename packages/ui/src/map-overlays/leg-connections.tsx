import type { ReactNode } from "react";
import { COURSE_COLOR } from "@indoor-o-route-analysis/core";
import { ControlRenderer } from "../control-renderer";

export interface LegConnectionPoint {
  id: string;
  x: number;
  y: number;
}

export interface RenderLegConnectionsOptions {
  /** Course controls in pixel space, in course order. */
  controls: LegConnectionPoint[];
  /**
   * When set, only the leg starting at this index is rendered (and rendered
   * highlighted); when null, every leg is rendered unhighlighted. Mirrors the
   * "single selected leg vs. whole course" behaviour used across viewers.
   */
  highlightedLegIndex?: number | null;
  color?: string;
  width?: number;
  highlightedWidth?: number;
  /** Halo filter id (see halo-filters.ts) applied to the highlighted leg. */
  highlightFilter?: string;
}

/**
 * Renders the sequence of leg lines connecting consecutive course controls,
 * shortened at both ends by ControlRenderer's control radius so lines don't
 * run under the control symbols. When `highlightedLegIndex` is provided, only
 * that leg is drawn (highlighted); otherwise all legs are drawn unhighlighted.
 */
export function renderLegConnections({
  controls,
  highlightedLegIndex = null,
  color = COURSE_COLOR,
  width = 2,
  highlightedWidth = 4,
  highlightFilter,
}: RenderLegConnectionsOptions): ReactNode[] {
  const legs: ReactNode[] = [];

  for (let i = 0; i < controls.length - 1; i++) {
    if (highlightedLegIndex !== null && highlightedLegIndex !== undefined && i !== highlightedLegIndex) {
      continue;
    }

    const from = controls[i];
    const to = controls[i + 1];
    const isHighlighted = highlightedLegIndex === i;

    legs.push(
      ControlRenderer.renderLeg({
        from,
        to,
        color,
        width: isHighlighted ? highlightedWidth : width,
        filter: isHighlighted ? highlightFilter : undefined,
        key: i,
      }),
    );
  }

  return legs;
}
