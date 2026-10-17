/**
 * Turns a human-route exploration trace into a deterministic, first-person
 * explanation of the plan — a template-based narration, not an LLM call
 * (no network, same trace always produces the same text). See
 * docs/article/human-route-finding.tex for the cognitive model this reads
 * out loud.
 */

import type { HumanRouteResult } from "./route-analyzer";
import { traceToFrames, type HumanRouteFrame } from "./human-route-frames";
import type { HumanRouteLabelResolver } from "./human-route-labels";

export interface ExplanationMessage {
  /** Index into the frame sequence from traceToFrames — lets the UI sync playback and seek. */
  frameIndex: number;
  text: string;
}

/** Deterministically picks among a few phrasings so the narration doesn't read as repetitive template text. */
function pick(variants: string[], seed: number): string {
  const index = (seed * 2654435761) % variants.length;
  return variants[Math.abs(index) % variants.length];
}

/** Joins items as natural-language prose: "A", "A and B", or "A, B and C". */
function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "up" if `to` is a higher floor than `from`, "down" if lower, undefined if either is unresolvable or they're equal. */
function directionBetween(fromLevel: number | undefined, toLevel: number | undefined): "up" | "down" | undefined {
  if (fromLevel === undefined || toLevel === undefined || fromLevel === toLevel) return undefined;
  return toLevel > fromLevel ? "up" : "down";
}

/** Where the human currently stands: the leg's own control (first step) or just the current floor (later steps — the corridor position itself has no name, only the floor matters). */
function trackingOriginPhrase(frame: HumanRouteFrame, resolver?: HumanRouteLabelResolver): string {
  const chain = frame.memory?.forwardChain;
  const controlNumber = frame.cluster ? resolver?.controlNumberOf(frame.cluster) : undefined;
  const floor = frame.cluster ? resolver?.floorLabelOf(frame.cluster) : undefined;

  if (chain && chain.length > 0) {
    return floor ? `From ${floor}` : "From here";
  }
  if (controlNumber) return `From control ${controlNumber}${floor ? ` on ${floor}` : ""}`;
  if (floor) return `From ${floor}`;
  return "From the start";
}

/** Where the backward search is currently trying to reach: the leg's own control (first step) or the next stair already fixed in the backward plan (later steps). */
function backtrackOrigin(frame: HumanRouteFrame, resolver?: HumanRouteLabelResolver): string {
  const chain = frame.memory?.backwardChain;
  const controlNumber = frame.cluster ? resolver?.controlNumberOf(frame.cluster) : undefined;
  const floor = frame.cluster ? resolver?.floorLabelOf(frame.cluster) : undefined;

  if (chain && chain.length > 0) {
    return `To get to stair ${chain[chain.length - 1]}${floor ? ` on ${floor}` : ""}`;
  }
  if (controlNumber) return `To control ${controlNumber}${floor ? ` on ${floor}` : ""}`;
  if (floor) return `To ${floor}`;
  return "To the control";
}

function explainFrame(frame: HumanRouteFrame, frameIndex: number, resolver?: HumanRouteLabelResolver): ExplanationMessage {
  switch (frame.kind) {
    case "same-floor":
      return {
        frameIndex,
        text: pick(
          [
            "Same floor? Yes — I can see the way through. Go.",
            "No stairs needed here, it's all on this floor. Straight there.",
          ],
          frameIndex,
        ),
      };

    case "same-floor-check":
      return { frameIndex, text: "Same floor? No - we need to check the stairs." };

    case "exploration": {
      const candidates = frame.candidates ?? [];
      const top = candidates[frame.chosenCandidateIndex ?? 0];
      const stairWord = candidates.length === 1 ? "stair" : "stairs";
      const stairList = joinWithAnd(candidates.map((c) => c.label));
      const currentLevel = frame.cluster ? resolver?.floorLevelOf(frame.cluster) : undefined;

      if (frame.completesRoute && top) {
        const origin = frame.side === "tracking"
          ? trackingOriginPhrase(frame, resolver)
          : `Backtracking: ${backtrackOrigin(frame, resolver)}`;
        return {
          frameIndex,
          text: `${origin}, the reachable ${stairWord} are ${stairList}. Stair ${top.label} connects the start-side and target-side paths, so choose ${top.label}.`,
        };
      }

      if (frame.side === "tracking") {
        const origin = trackingOriginPhrase(frame, resolver);
        if (!top) return { frameIndex, text: `${origin}, there's nowhere left to try.` };
        const dir = directionBetween(currentLevel, resolver?.floorLevelOf(top.toCluster));
        return {
          frameIndex,
          text: `${origin}, we can reach ${stairWord} ${stairList}. Let us try${dir ? ` ${dir}` : ""} ${top.label}.`,
        };
      }

      const origin = backtrackOrigin(frame, resolver);
      if (!top) return { frameIndex, text: `Backtracking: ${origin}, there's nowhere left to try.` };
      const backDir = directionBetween(currentLevel, resolver?.floorLevelOf(top.toCluster));
      const executionDir = backDir === "up" ? "down" : backDir === "down" ? "up" : undefined;
      const candidateFloor = resolver?.floorLabelOf(top.toCluster);
      return {
        frameIndex,
        text: `Backtracking: ${origin}, we can come from ${stairWord} ${stairList}. Let us try${executionDir ? ` ${executionDir}` : ""} ${top.label}${candidateFloor ? ` from ${candidateFloor}` : ""}.`,
      };
    }

    case "meeting-rejected":
      return {
        frameIndex,
        text: frame.rejectedReason === "stair-reuse"
          ? pick(
              [
                "Wait — that would mean crossing the same staircase twice. No good, keep looking.",
                "Hold on, I'd be using that stair again. Not that way.",
              ],
              frameIndex,
            )
          : "Hmm, that doesn't actually connect through. Try another way.",
      };

    case "closure": {
      const labels = frame.planLabels ?? [];
      if (labels.length === 0) {
        return { frameIndex, text: "That closes the loop — no stairs needed after all. Go!" };
      }
      return {
        frameIndex,
        text: `The start and control are now connected. Route: ${labels.join(", ")}. Go!`,
      };
    }

    case "no-route":
      return { frameIndex, text: "I can't find a way through from here." };
  }
}

/** Generates the full explanation transcript for a completed human-route search. */
export function traceToExplanation(result: HumanRouteResult, resolver?: HumanRouteLabelResolver): ExplanationMessage[] {
  const frames = traceToFrames(result);
  return frames.map((frame, index) => explainFrame(frame, index, resolver));
}
