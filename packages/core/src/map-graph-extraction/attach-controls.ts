/**
 * Attaches an event's existing controls to the generated graph.
 *
 * This step is not optional. Controls are graph nodes in this project, not
 * decoration: 53 of Herkules E1's 509 edges have a control as an endpoint, and
 * `RouteAnalyzer` can only route between controls that have edges into the
 * vertex graph. A generated graph with unattached controls produces no routable
 * legs at all.
 */

import { hasLineOfSight } from "./line-of-sight";
import { snapPointToGraph } from "./snap";
import type { Control } from "../models/control";
import type { BitMask, TracedGraph } from "./types";

export interface AttachedControl {
  controlId: string;
  nodeId: number;
  distancePx: number;
}

export interface UnattachedControl {
  controlId: string;
  px: number;
  py: number;
  /** Distance to the nearest graph position, or undefined if there was no graph. */
  distancePx?: number;
  /**
   * Why the control could not be attached. "too-far" and "no-sight" call for
   * different fixes — moving the graph closer versus checking the mask around
   * the control — and the report must not conflate them.
   */
  reason: "no-graph" | "too-far" | "no-sight";
}

export interface AttachControlsOptions {
  /** Beyond this the control is reported rather than attached. */
  maxSnapDistancePx: number;
  snapToExistingPx: number;
  /**
   * Free-space mask used to check that the connector does not cross a wall.
   *
   * Without it the snap radius has to stay small enough that nothing on the far
   * side of a wall is ever in range, which leaves controls in wide rooms
   * unattached. With it the radius can be generous, because a candidate on the
   * wrong side of a wall is rejected on its own merits.
   */
  freeSpace?: BitMask;
  /** Blocked pixels tolerated along the connector before it counts as a wall. */
  wallTolerancePx?: number;
  /** How far to look for free space beside a control before giving up. */
  originSearchPx?: number;
}

/** Nearest free pixel to (px, py) within `radius`, searched outward. */
export function nearestFreePixel(
  free: BitMask,
  px: number,
  py: number,
  radius: number,
): { px: number; py: number } | undefined {
  const cx = Math.round(px);
  const cy = Math.round(py);
  if (cx >= 0 && cy >= 0 && cx < free.width && cy < free.height && free.data[cy * free.width + cx]) {
    return { px: cx, py: cy };
  }

  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= free.width || y >= free.height) continue;
        if (free.data[y * free.width + x]) return { px: x, py: y };
      }
    }
  }
  return undefined;
}

/**
 * Snaps every control whose pixel position falls inside `panelMask` onto
 * `graph`.
 *
 * A control further than `maxSnapDistancePx` from the graph is never attached.
 * Guessing would connect a control to an unrelated corridor and produce
 * confidently wrong routes; reporting it lets the user place it.
 *
 * Candidates are tried nearest first and the first one in clear sight wins.
 * The nearest candidate alone is not enough: a control whose room joins the
 * corridor around a corner has its nearest graph position behind masonry, while
 * a candidate a metre or two farther is in plain sight. Rejecting the control
 * outright on that single blocked chord is the "guard as veto" failure mode.
 */
export function attachControls(
  graph: TracedGraph,
  controls: { control: Control; px: number; py: number }[],
  options: AttachControlsOptions,
): { graph: TracedGraph; attached: AttachedControl[]; unattached: UnattachedControl[] } {
  let working = graph;
  const attached: AttachedControl[] = [];
  const unattached: UnattachedControl[] = [];

  for (const { control, px, py } of controls) {
    // Sight is traced from the nearest free pixel, not from the control's
    // drawn centre. A control is by construction somewhere a runner can stand,
    // but its centre routinely sits on its own printed circle or number, which
    // is not free space - starting the ray there rejects controls whose floor
    // is plainly connected.
    const free = options.freeSpace;
    const origin = free ? (nearestFreePixel(free, px, py, options.originSearchPx ?? 12) ?? { px, py }) : undefined;

    const snapped = snapPointToGraph(
      working,
      { px, py },
      { kind: "control", controlId: control.id },
      options.snapToExistingPx,
      {
        maxDistancePx: options.maxSnapDistancePx,
        accept:
          free && origin
            ? (candidate) => hasLineOfSight(free, origin, candidate, options.wallTolerancePx ?? 2)
            : undefined,
      },
    );

    if (snapped) {
      working = snapped.graph;
      attached.push({ controlId: control.id, nodeId: snapped.nodeId, distancePx: snapped.distancePx });
      continue;
    }

    // Nothing within range was accepted. Probe again without the sight test to
    // tell "the graph is too far" apart from "the graph is near but walled off".
    const nearest = snapPointToGraph(
      working,
      { px, py },
      { kind: "control", controlId: control.id },
      options.snapToExistingPx,
    );
    if (!nearest) {
      unattached.push({ controlId: control.id, px, py, reason: "no-graph" });
    } else {
      unattached.push({
        controlId: control.id,
        px,
        py,
        distancePx: nearest.distancePx,
        reason: nearest.distancePx > options.maxSnapDistancePx ? "too-far" : "no-sight",
      });
    }
  }

  return { graph: working, attached, unattached };
}
