/**
 * Automatic routing-graph extraction from indoor orienteering map documents.
 *
 * Design: docs/superpowers/specs/2026-07-27-map-graph-extraction-design.md
 */

export * from "./types";
export * from "./palette";
export * from "./morphology";
export * from "./free-space";
export * from "./skeleton";
export * from "./trace";
export * from "./simplify";
export * from "./contour";
export * from "./snap";
export * from "./line-of-sight";
export * from "./pair-stairs";
export * from "./stairs";
export * from "./attach-controls";
export * from "./to-event";
export * from "./pipeline";
export { INDOOR_KARTNORM_PALETTE, INDOOR_KARTNORM_SOURCE } from "./indoor-kartnorm.generated";
export { INDOOR_COLOUR_LUT } from "./indoor-colour-lut.generated";
