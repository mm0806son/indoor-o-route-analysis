/**
 * Serializes a human-route search (trace, explanation, thinking-effort
 * analysis) to JSON for machine re-use and to Markdown for a readable
 * transcript. Fully offline — local file download only, no network.
 */

import type { HumanRouteResult } from "./route-analyzer";
import { traceToExplanation, type ExplanationMessage } from "./human-route-explanation";
import { analyzeThinkingEffort, type ThinkingEffort } from "./human-route-effort";
import type { HumanRouteLabelResolver } from "./human-route-labels";

export interface HumanRouteExportBundle {
  /** Course-relative labels ("3", "S", "F") when available; falls back to the raw control id otherwise. */
  leg: { fromControlId: string; toControlId: string; fromLabel: string; toLabel: string };
  result: HumanRouteResult;
  explanation: ExplanationMessage[];
  effort: ThinkingEffort;
}

/** Builds the full export bundle from a completed search. */
export function buildHumanRouteExportBundle(
  fromControlId: string,
  toControlId: string,
  result: HumanRouteResult,
  shortestDistanceMeters?: number,
  labels?: { fromLabel?: string; toLabel?: string },
  resolver?: HumanRouteLabelResolver,
): HumanRouteExportBundle {
  return {
    leg: {
      fromControlId,
      toControlId,
      fromLabel: labels?.fromLabel ?? fromControlId,
      toLabel: labels?.toLabel ?? toControlId,
    },
    result,
    explanation: traceToExplanation(result, resolver),
    effort: analyzeThinkingEffort(result, shortestDistanceMeters),
  };
}

export function humanRouteExportToJson(bundle: HumanRouteExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function humanRouteExportFromJson(json: string): HumanRouteExportBundle {
  return JSON.parse(json) as HumanRouteExportBundle;
}

export function humanRouteExportToMarkdown(bundle: HumanRouteExportBundle): string {
  const { leg, result, explanation, effort } = bundle;
  const lines: string[] = [];

  lines.push(`# Human route: ${leg.fromLabel} → ${leg.toLabel}`, "");
  lines.push(
    result.sameFloor
      ? "Solved on the same floor — no stairs needed."
      : `Plan: ${[...result.forwardLabels, ...result.backwardLabels].join(", ")}`,
    "",
  );

  lines.push("## Thinking", "");
  for (const message of explanation) {
    lines.push(`- ${message.text}`);
  }
  lines.push("");

  lines.push("## Effort summary", "");
  lines.push(`- Same floor: ${effort.sameFloor ? "yes" : "no"}`);
  lines.push(`- Mental steps: ${effort.mentalSteps}`);
  lines.push(`- Candidates evaluated: ${effort.candidatesEvaluated}`);
  lines.push(`- Clusters visited (tracking / backtracking): ${effort.clustersVisited.tracking} / ${effort.clustersVisited.backtracking}`);
  lines.push(`- Rejected meetings: ${effort.rejectedMeetings}`);
  lines.push(`- Plan depth (stair crossings): ${effort.planDepth}`);
  lines.push(`- Peak memory load (untried fallback branches): ${effort.memoryLoad.peak}`);
  if (effort.humanOptimalGap !== undefined) {
    lines.push(`- Human/optimal length ratio: ${effort.humanOptimalGap.toFixed(2)}`);
  }
  lines.push(`- Cognitive effort score: ${effort.cognitiveEffortScore.toFixed(1)}`);
  lines.push("");

  return lines.join("\n");
}
