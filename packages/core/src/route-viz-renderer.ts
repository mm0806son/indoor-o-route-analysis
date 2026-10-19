import {
  VIZ_BACKGROUND_COLOR,
  VIZ_BIG_FLASH_MAX_OPACITY,
  VIZ_BIG_FLASH_RING_MAX_RADIUS_RATIO,
  VIZ_BIG_FLASH_RING_SHADOW_BLUR,
  VIZ_CAPTION_COLOR,
  VIZ_CAPTION_FONT,
  VIZ_CONTROL_COLOR,
  VIZ_CONTROL_LINE_WIDTH,
  VIZ_CONTROL_OPACITY,
  VIZ_CONTROL_RADIUS,
  VIZ_CONTROL_STROKE_WIDTH,
  VIZ_FLASH_COLOR,
  VIZ_FLASH_EDGE_WIDTH,
  VIZ_FLASH_HOT_COLOR,
  VIZ_FLASH_NODE_RADIUS,
  VIZ_FLASH_SHADOW_BLUR,
  VIZ_GRAPH_DASH_PATTERN,
  VIZ_GRAPH_EDGE_COLOR,
  VIZ_GRAPH_EDGE_OPACITY,
  VIZ_GRAPH_EDGE_WIDTH,
  VIZ_GRAPH_NODE_COLOR,
  VIZ_GRAPH_NODE_RADIUS,
  VIZ_ROUTE_HIGHLIGHT_WIDTH,
  VIZ_ROUTE_SHADOW_BLUR,
  VIZ_SUBCAPTION_COLOR,
  VIZ_SUBCAPTION_FONT,
} from "./viz-constants";

/**
 * Minimal Canvas2D surface actually used by the drawing functions below.
 * Structurally compatible with both `@napi-rs/canvas`'s SKRSContext2D (Node)
 * and the browser's native CanvasRenderingContext2D, so the same drawing
 * code can run in a CLI video exporter and (later) an in-browser view.
 */
export interface MinimalCanvas2DContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  shadowBlur: number;
  shadowColor: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  stroke(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
  save(): void;
  restore(): void;
}

export interface VizEdge {
  from: string;
  to: string;
  /** Stairs/map-segment transitions — drawn dashed in the muted graph to stand out from ordinary corridors. */
  ignoreLength?: boolean;
}

export interface VizLayout {
  /** Precomputed pixel position for every node/control id present in the graph. */
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

export interface FrameFlashState {
  /** nodeId -> intensity 0..1, decaying over time. */
  nodeFlash: Map<string, number>;
  /** "fromId:toId" -> intensity 0..1, decaying over time. */
  edgeFlash: Map<string, number>;
}

export interface RouteHighlight {
  path: string[];
  color: string;
  /** 0..1 reveal progress along the path (for an animated draw-on effect). */
  progress: number;
  /**
   * Opacity, 0..1; defaults to fully opaque (1) when omitted. Routes shown
   * together in a swarm (e.g. "all routes") can use partial opacity so that
   * overlapping routes' colors blend together on shared corridors instead of
   * whichever route is drawn last opaquely hiding every other route's color.
   */
  alpha?: number;
}

export type VizPhase =
  | "intro"
  | "shortest"
  | "easiest"
  | "human"
  | "all-routes"
  | "outro";

/**
 * A big, brief celebratory flash — a translucent full-frame wash plus an
 * expanding shockwave ring — triggered the instant a route (or the whole
 * all-routes search) is found/completed.
 */
export interface ScreenFlash {
  color: string;
  /** 0..1, decaying over time; the whole effect is skipped once it reaches 0. */
  intensity: number;
  /** Node/control id to center the shockwave ring on. */
  centerNodeId?: string;
}

export interface RouteVizFrameState {
  phase: VizPhase;
  caption: string;
  subcaption?: string;
  flash: FrameFlashState;
  highlightedRoutes: RouteHighlight[];
  screenFlash?: ScreenFlash;
}

/** The leg's start/end controls, drawn as a purple ring + line like the web app's course overlay. */
export interface LegControls {
  fromNodeId: string;
  toNodeId: string;
}

export function drawBackground(
  ctx: MinimalCanvas2DContext,
  layout: VizLayout,
): void {
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = VIZ_BACKGROUND_COLOR;
  ctx.fillRect(0, 0, layout.width, layout.height);
}

export interface MutedGraphStyle {
  nodeRadius?: number;
  edgeWidth?: number;
  nodeColor?: string;
  edgeColor?: string;
  edgeOpacity?: number;
  nodeOpacity?: number;
}

/** Optional screen-space styling lets maps share the renderer without inheriting video-sized symbols. */
export function drawMutedGraph(
  ctx: MinimalCanvas2DContext,
  edges: VizEdge[],
  layout: VizLayout,
  style: MutedGraphStyle = {},
): void {
  ctx.shadowBlur = 0;
  ctx.globalAlpha = style.edgeOpacity ?? VIZ_GRAPH_EDGE_OPACITY;
  ctx.strokeStyle = style.edgeColor ?? VIZ_GRAPH_EDGE_COLOR;
  ctx.lineWidth = style.edgeWidth ?? VIZ_GRAPH_EDGE_WIDTH;

  const strokeEdges = (predicate: (edge: VizEdge) => boolean) => {
    ctx.beginPath();
    for (const edge of edges) {
      if (!predicate(edge)) continue;
      const a = layout.positions.get(edge.from);
      const b = layout.positions.get(edge.to);
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  };

  ctx.setLineDash([]);
  strokeEdges((edge) => !edge.ignoreLength);

  ctx.setLineDash(VIZ_GRAPH_DASH_PATTERN);
  strokeEdges((edge) => !!edge.ignoreLength);
  ctx.setLineDash([]);

  ctx.globalAlpha = style.nodeOpacity ?? 1;
  ctx.fillStyle = style.nodeColor ?? VIZ_GRAPH_NODE_COLOR;
  for (const pos of layout.positions.values()) {
    ctx.beginPath();
    ctx.arc(
      pos.x,
      pos.y,
      style.nodeRadius ?? VIZ_GRAPH_NODE_RADIUS,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Draws the leg's start/end controls as purple rings connected by a straight
 * line, trimmed to the ring edges — matching the web app's course overlay
 * style (COURSE_COLOR ring controls + leg line), re-scaled for this video's
 * fitted canvas.
 */
export function drawLegControls(
  ctx: MinimalCanvas2DContext,
  layout: VizLayout,
  legControls: LegControls,
): void {
  const a = layout.positions.get(legControls.fromNodeId);
  const b = layout.positions.get(legControls.toNodeId);
  if (!a || !b) return;

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = VIZ_CONTROL_OPACITY;
  ctx.strokeStyle = VIZ_CONTROL_COLOR;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist > VIZ_CONTROL_RADIUS * 2) {
    const ux = dx / dist;
    const uy = dy / dist;
    ctx.lineWidth = VIZ_CONTROL_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(a.x + ux * VIZ_CONTROL_RADIUS, a.y + uy * VIZ_CONTROL_RADIUS);
    ctx.lineTo(b.x - ux * VIZ_CONTROL_RADIUS, b.y - uy * VIZ_CONTROL_RADIUS);
    ctx.stroke();
  }

  ctx.lineWidth = VIZ_CONTROL_STROKE_WIDTH;
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, VIZ_CONTROL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawScreenFlash(
  ctx: MinimalCanvas2DContext,
  layout: VizLayout,
  flash: ScreenFlash | undefined,
): void {
  if (!flash || flash.intensity <= 0) return;
  const intensity = Math.min(1, flash.intensity);

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = intensity * VIZ_BIG_FLASH_MAX_OPACITY;
  ctx.fillStyle = flash.color;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.restore();

  const center = flash.centerNodeId
    ? layout.positions.get(flash.centerNodeId)
    : undefined;
  if (!center) return;

  const maxRadius =
    Math.min(layout.width, layout.height) * VIZ_BIG_FLASH_RING_MAX_RADIUS_RATIO;
  const radius = maxRadius * (1 - intensity);

  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.shadowBlur = VIZ_BIG_FLASH_RING_SHADOW_BLUR;
  ctx.shadowColor = flash.color;
  ctx.strokeStyle = flash.color;
  ctx.lineWidth = 2 + 6 * intensity;
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(1, radius), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function mixHexColors(from: string, to: string, t: number): string {
  const clampT = Math.max(0, Math.min(1, t));
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const r = Math.round(fr + (tr - fr) * clampT);
  const g = Math.round(fg + (tg - fg) * clampT);
  const b = Math.round(fb + (tb - fb) * clampT);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A freshly sparked node/edge burns hot white, then cools into the pure
 * spark color as its intensity decays — an "electric spark" rather than a
 * flat, single-tone flash.
 */
function sparkColorForIntensity(intensity: number): string {
  const hotness = Math.max(0, (intensity - 0.55) / 0.45);
  return mixHexColors(VIZ_FLASH_COLOR, VIZ_FLASH_HOT_COLOR, hotness);
}

export function drawFlashOverlay(
  ctx: MinimalCanvas2DContext,
  edges: VizEdge[],
  flash: FrameFlashState,
  layout: VizLayout,
): void {
  for (const edge of edges) {
    const intensity = Math.max(
      flash.edgeFlash.get(`${edge.from}:${edge.to}`) ?? 0,
      flash.edgeFlash.get(`${edge.to}:${edge.from}`) ?? 0,
    );
    if (intensity <= 0) continue;
    const a = layout.positions.get(edge.from);
    const b = layout.positions.get(edge.to);
    if (!a || !b) continue;

    const color = sparkColorForIntensity(intensity);
    ctx.save();
    ctx.globalAlpha = Math.min(1, intensity);
    ctx.shadowBlur = VIZ_FLASH_SHADOW_BLUR * intensity;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = VIZ_FLASH_EDGE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  for (const [nodeId, intensity] of flash.nodeFlash) {
    if (intensity <= 0) continue;
    const pos = layout.positions.get(nodeId);
    if (!pos) continue;

    const color = sparkColorForIntensity(intensity);
    ctx.save();
    ctx.globalAlpha = Math.min(1, intensity);
    ctx.shadowBlur = VIZ_FLASH_SHADOW_BLUR * intensity;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, VIZ_FLASH_NODE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function buildIgnoreLengthEdgeKeys(edges: VizEdge[]): Set<string> {
  const keys = new Set<string>();
  for (const edge of edges) {
    if (!edge.ignoreLength) continue;
    keys.add(`${edge.from}:${edge.to}`);
    keys.add(`${edge.to}:${edge.from}`);
  }
  return keys;
}

export function drawHighlightedRoutes(
  ctx: MinimalCanvas2DContext,
  routes: RouteHighlight[],
  edges: VizEdge[],
  layout: VizLayout,
): void {
  const ignoreLengthEdgeKeys = buildIgnoreLengthEdgeKeys(edges);

  for (const route of routes) {
    const { path, color, progress, alpha } = route;
    if (path.length < 2 || progress <= 0) continue;

    const totalSegments = path.length - 1;
    const revealed = Math.max(
      0,
      Math.min(totalSegments, progress * totalSegments),
    );
    const fullSegments = Math.floor(revealed);
    const partial = revealed - fullSegments;

    ctx.save();
    ctx.globalAlpha = alpha ?? 1;
    ctx.lineWidth = VIZ_ROUTE_HIGHLIGHT_WIDTH;
    // Glow while the route is actively being drawn on; once fully revealed
    // ("finished"), drop the glow for a clean, crisp, legible line.
    ctx.shadowBlur = progress < 1 ? VIZ_ROUTE_SHADOW_BLUR : 0;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;

    // Drawn segment-by-segment (rather than one continuous path) so each
    // segment can switch between solid and dashed depending on whether it's
    // an "ignore length" (stairs/map-segment transition) edge, matching the muted graph.
    const strokeSegment = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      dashed: boolean,
    ) => {
      ctx.setLineDash(dashed ? VIZ_GRAPH_DASH_PATTERN : []);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    };

    for (let i = 0; i < fullSegments; i++) {
      const a = layout.positions.get(path[i]);
      const b = layout.positions.get(path[i + 1]);
      if (a && b)
        strokeSegment(
          a,
          b,
          ignoreLengthEdgeKeys.has(`${path[i]}:${path[i + 1]}`),
        );
    }
    if (partial > 0 && fullSegments < totalSegments) {
      const a = layout.positions.get(path[fullSegments]);
      const b = layout.positions.get(path[fullSegments + 1]);
      if (a && b) {
        const end = {
          x: a.x + (b.x - a.x) * partial,
          y: a.y + (b.y - a.y) * partial,
        };
        strokeSegment(
          a,
          end,
          ignoreLengthEdgeKeys.has(
            `${path[fullSegments]}:${path[fullSegments + 1]}`,
          ),
        );
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export function drawCaption(
  ctx: MinimalCanvas2DContext,
  frame: RouteVizFrameState,
  layout: VizLayout,
): void {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const marginX = Math.max(24, layout.width * 0.02);
  const captionY = layout.height - Math.max(48, layout.height * 0.06);

  ctx.fillStyle = VIZ_CAPTION_COLOR;
  ctx.font = VIZ_CAPTION_FONT;
  ctx.fillText(frame.caption, marginX, captionY);

  if (frame.subcaption) {
    ctx.fillStyle = VIZ_SUBCAPTION_COLOR;
    ctx.font = VIZ_SUBCAPTION_FONT;
    ctx.fillText(frame.subcaption, marginX, captionY + 32);
  }
  ctx.restore();
}

/**
 * Composes a full frame: black background, muted graph, purple leg/control
 * overlay, decaying flash overlay for recently visited nodes/edges, bright
 * highlighted route paths, a big celebratory flash on route-found moments,
 * and a caption. This is the single entry point video/preview renderers
 * should call once per frame.
 */
export function renderRouteVizFrame(
  ctx: MinimalCanvas2DContext,
  edges: VizEdge[],
  layout: VizLayout,
  legControls: LegControls,
  frame: RouteVizFrameState,
): void {
  drawBackground(ctx, layout);
  drawMutedGraph(ctx, edges, layout);
  drawLegControls(ctx, layout, legControls);
  drawFlashOverlay(ctx, edges, frame.flash, layout);
  drawHighlightedRoutes(ctx, frame.highlightedRoutes, edges, layout);
  drawScreenFlash(ctx, layout, frame.screenFlash);
  drawCaption(ctx, frame, layout);
}
