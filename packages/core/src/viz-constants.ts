import { COURSE_COLOR, LABS_ROUTE_COLOR, ROUTE_ANALYSIS_COLORS } from "./rendering-constants";

// Algorithm Visualization (route-viz-cli and any future in-app "watch the
// algorithm" view). Sizes here are canvas pixels for a fitted, arbitrary-size
// video/preview canvas — independent of the mm-scaled map rendering constants
// in rendering-constants.ts, which assume a real-world-scaled document canvas.
// Lives behind the ./render subpath (with route-viz-renderer.ts) since it is
// only consumed by apps/route-viz-cli.
export const VIZ_BACKGROUND_COLOR = "#000000";
// Muted sky blue — more visible than a plain grey while still reading as
// "background", so the bright search/route colors keep the visual lead.
export const VIZ_GRAPH_EDGE_COLOR = "#3d6d99";
export const VIZ_GRAPH_NODE_COLOR = "#6fa3d8";
export const VIZ_GRAPH_EDGE_OPACITY = 0.85;
export const VIZ_GRAPH_EDGE_WIDTH = 1.8;
export const VIZ_GRAPH_NODE_RADIUS = 3.2;
// "Ignore length" edges (stairs/map-segment transitions) are dashed in the muted graph to
// visually distinguish them from ordinary corridors.
export const VIZ_GRAPH_DASH_PATTERN = [6, 4];

// Search "spark" effect: a hot white-gold flash that ignites on evaluation
// and cools into the pure spark color as it fades out (see
// route-viz-renderer's sparkColorForIntensity). Colored, not white/grey, so
// it reads as an electric spark rather than a dull flicker.
export const VIZ_FLASH_COLOR = "#FFD60A";
export const VIZ_FLASH_HOT_COLOR = "#FFFFFF";
export const VIZ_FLASH_SHADOW_BLUR = 26;
export const VIZ_FLASH_DECAY_PER_FRAME = 0.1;
export const VIZ_FLASH_NODE_RADIUS = 7;
export const VIZ_FLASH_EDGE_WIDTH = 3.5;

export const VIZ_SHORTEST_ROUTE_COLOR = "#00F5D4";
export const VIZ_EASIEST_ROUTE_COLOR = LABS_ROUTE_COLOR;
export const VIZ_HUMAN_ROUTE_COLOR = "#FF8C42";
// A wider palette than ROUTE_ANALYSIS_COLORS (6 hues) for the "all routes"
// swarm: with 12 hues cycling by discovery rank, fewer of the many distinct
// routes collide onto the same color where they share a corridor, so the
// route set reads as visibly varied rather than dominated by one hue.
export const VIZ_ALL_ROUTES_PALETTE = [
  ...ROUTE_ANALYSIS_COLORS,
  "#FF6B6B",
  "#4CC9F0",
  "#F72585",
  "#F4A300",
  "#7209B7",
  "#43AA8B",
];
export const VIZ_ROUTE_HIGHLIGHT_WIDTH = 4.5;
// Kept small so overlapping routes' glows don't bleed into each other and
// wash out their distinct colors on shared corridors once many routes are
// shown at once — the stroke color itself still reads clearly.
export const VIZ_ROUTE_SHADOW_BLUR = 3;
// Partial opacity for the "all routes" swarm: on corridors shared by many
// routes, translucent strokes blend into each other (visibly showing every
// route's color layered together) instead of one route opaquely overwriting
// every other route's color there.
export const VIZ_ALL_ROUTES_ALPHA = 0.55;

export const VIZ_CAPTION_COLOR = COURSE_COLOR;
export const VIZ_SUBCAPTION_COLOR = "#cccccc";
export const VIZ_CAPTION_FONT = "600 34px sans-serif";
export const VIZ_SUBCAPTION_FONT = "400 22px sans-serif";

// Big celebratory flash triggered the instant the shortest route, the
// easiest route, or the full all-routes search is found/complete: a brief
// translucent full-frame wash plus an expanding shockwave ring centered on
// the destination control.
export const VIZ_BIG_FLASH_MAX_OPACITY = 0.35;
export const VIZ_BIG_FLASH_DECAY_PER_FRAME = 0.07;
export const VIZ_BIG_FLASH_RING_MAX_RADIUS_RATIO = 0.5; // relative to min(canvas width, height)
export const VIZ_BIG_FLASH_RING_SHADOW_BLUR = 40;
export const VIZ_ALL_ROUTES_FOUND_FLASH_COLOR = "#FFFFFF";

// Purple leg/control overlay matching the web app's course rendering
// (COURSE_COLOR ring controls + straight leg line, control-renderer.tsx),
// re-scaled for this video's fitted, arbitrary-size canvas.
export const VIZ_CONTROL_COLOR = COURSE_COLOR;
export const VIZ_CONTROL_RADIUS = 14;
export const VIZ_CONTROL_STROKE_WIDTH = 3;
export const VIZ_CONTROL_LINE_WIDTH = 2.5;
export const VIZ_CONTROL_OPACITY = 0.95;
