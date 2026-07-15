import type { ReactNode } from "react";

/**
 * SVG filter ids for the animated halo/glow used to highlight selected or
 * playing-back elements (routes, nodes, edges). Centralized here so every
 * viewer references the same ids and markup instead of re-declaring
 * per-viewer <defs> blocks with the same shape but drifting stdDeviation /
 * color / animation values.
 */
export const HALO_FILTER_IDS = {
  whiteRoute: "white-halo-route",
  whiteNode: "white-halo-node",
  whiteEdge: "white-halo-edge",
  orangeNode: "orange-halo-node",
  orangeEdge: "orange-halo-edge",
} as const;

export type HaloFilterId = (typeof HALO_FILTER_IDS)[keyof typeof HALO_FILTER_IDS];

interface HaloFilterSpec {
  id: string;
  color: string;
  /** stdDeviation of the outer (wider) blur pass. */
  outerBlur: number;
  /** stdDeviation of the inner (tighter) blur pass. */
  innerBlur: number;
  /** Animation period, e.g. "1s" or "1.5s". */
  duration: string;
}

/** Renders one two-pass animated glow <filter>. Must live inside <defs>. */
function renderHaloFilter({ id, color, outerBlur, innerBlur, duration }: HaloFilterSpec): ReactNode {
  return (
    <filter key={id} id={id} x="-300%" y="-300%" width="700%" height="700%">
      <feGaussianBlur in="SourceAlpha" stdDeviation={outerBlur} result="blur1" />
      <feFlood floodColor={color} floodOpacity="1" result="flood1">
        <animate attributeName="floodOpacity" values="0.7;1;0.7" dur={duration} repeatCount="indefinite" />
      </feFlood>
      <feComposite in2="blur1" operator="in" result="halo1" />
      <feGaussianBlur in="SourceAlpha" stdDeviation={innerBlur} result="blur2" />
      <feFlood floodColor={color} floodOpacity="1" result="flood2">
        <animate attributeName="floodOpacity" values="0.8;1;0.8" dur={duration} repeatCount="indefinite" />
      </feFlood>
      <feComposite in2="blur2" operator="in" result="halo2" />
      <feMerge>
        <feMergeNode in="halo1" />
        <feMergeNode in="halo2" />
        <feMergeNode in="halo1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

const HALO_FILTER_SPECS: Record<HaloFilterId, HaloFilterSpec> = {
  [HALO_FILTER_IDS.whiteRoute]: {
    id: HALO_FILTER_IDS.whiteRoute,
    color: "white",
    outerBlur: 6,
    innerBlur: 3,
    duration: "1.5s",
  },
  [HALO_FILTER_IDS.whiteNode]: {
    id: HALO_FILTER_IDS.whiteNode,
    color: "white",
    outerBlur: 6,
    innerBlur: 3,
    duration: "1.5s",
  },
  [HALO_FILTER_IDS.whiteEdge]: {
    id: HALO_FILTER_IDS.whiteEdge,
    color: "white",
    outerBlur: 8,
    innerBlur: 4,
    duration: "1.5s",
  },
  [HALO_FILTER_IDS.orangeNode]: {
    id: HALO_FILTER_IDS.orangeNode,
    color: "#ff6600",
    outerBlur: 10,
    innerBlur: 5,
    duration: "1s",
  },
  [HALO_FILTER_IDS.orangeEdge]: {
    id: HALO_FILTER_IDS.orangeEdge,
    color: "#ff6600",
    outerBlur: 12,
    innerBlur: 6,
    duration: "1s",
  },
};

/**
 * Renders the requested halo <filter> definitions. Pass the ids you use in
 * the current viewer (e.g. `[HALO_FILTER_IDS.whiteRoute]`) — must be placed
 * inside a <defs> element.
 */
export function renderHaloFilterDefs(ids: HaloFilterId[]): ReactNode {
  return <>{ids.map((id) => renderHaloFilter(HALO_FILTER_SPECS[id]))}</>;
}
