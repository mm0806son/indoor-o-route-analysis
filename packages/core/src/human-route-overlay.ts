/**
 * Converts a single HumanRouteFrame into a renderer-agnostic overlay model
 * for *this step only* (no visited-history fog): the current tracking/
 * backtracking routes-in-memory, which candidate stairs to show as ranked
 * badges, and whether a meeting (accepted or rejected) should be
 * highlighted. Pure and stateless. Consumed by the shared SVG overlay
 * renderer (apps/web/components/shared) for the Labs "Human thinking" live
 * map view.
 */

import type { HumanRouteFrame } from "./human-route-frames";
import { assignClusterColors } from "./graph-clusters";

export interface HumanRouteOverlayCandidate {
  label: string;
  toCluster: string;
  /** The node this candidate arrives at, for badge placement. Absent for fixtures built without it. */
  toNode?: string;
  /** Real same-floor node sequence for this candidate's corridor walk (see HumanRouteCandidate.path). Absent for fixtures built without it. */
  path?: string[];
  /** 1-based preference order; 1 is the nearest/first-tried candidate. */
  rank: number;
  /** True only for the top-ranked candidate - the one the human tries next. */
  chosen: boolean;
  /**
   * A distinct color for this candidate's rank, shared by its path line and
   * its badge, so it's traceable across the map at a glance. Deterministic
   * by rank (not by step), so "candidate 1" is always the same color across
   * the whole simulation - keyed by rank via the same golden-angle palette
   * graph-clusters.ts uses for clusters, reused here rather than duplicated.
   */
  color: string;
}

export interface HumanRouteOverlayModel {
  /** The specific node the human is standing at for this step - distinct from the candidate destination badges (exploration only). */
  origin?: string;
  /** Candidate stairs considered from the frame's cluster, ranked; empty outside exploration frames. */
  candidates: HumanRouteOverlayCandidate[];
  /** Node-level waypoints for the tracking side's committed route-in-memory so far (see HumanRouteMemorySnapshot.forwardPath). */
  forwardPath?: string[];
  /** Node-level waypoints for the backtracking side's committed route-in-memory so far. */
  backwardPath?: string[];
  /** The cluster a meeting occurred at (accepted, at closure) or was attempted at (rejected). */
  meetingCluster?: string;
  /** True if this frame represents a rejected meeting attempt. */
  meetingRejected: boolean;
  /**
   * The two exact nodes that join into one continuous route at closure: where
   * the tracking side's path arrives, and where the backtracking side's path
   * starts. Often the same node; when they differ there's an (undrawn)
   * same-floor walk connecting them within the meeting cluster.
   */
  meetingConnector?: { from: string; to: string };
}

export function buildHumanRouteOverlay(frame: HumanRouteFrame): HumanRouteOverlayModel {
  const rankColors = assignClusterColors((frame.candidates ?? []).map((_, i) => String(i + 1)));
  const candidates: HumanRouteOverlayCandidate[] = (frame.candidates ?? []).map((candidate, i) => ({
    label: candidate.label,
    toCluster: candidate.toCluster,
    toNode: candidate.toNode,
    path: candidate.path,
    rank: i + 1,
    chosen: i === 0,
    color: rankColors[String(i + 1)],
  }));

  let meetingCluster: string | undefined;
  if (frame.kind === "meeting-rejected") {
    meetingCluster = frame.cluster;
  } else if (frame.kind === "closure") {
    meetingCluster = frame.visitedByTracking.find((c) => frame.visitedByBacktracking.includes(c));
  }

  const forwardPath = frame.memory?.forwardPath;
  const backwardPath = frame.memory?.backwardPath;
  const meetingConnector = frame.kind === "closure" && forwardPath?.length && backwardPath?.length
    ? { from: forwardPath[forwardPath.length - 1], to: backwardPath[0] }
    : undefined;

  return {
    origin: frame.kind === "exploration" ? frame.atNode : undefined,
    candidates,
    forwardPath,
    backwardPath,
    meetingCluster,
    meetingRejected: frame.kind === "meeting-rejected",
    meetingConnector,
  };
}
