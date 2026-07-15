import type { RouteInfo, TraceEvent } from "@indoor-o-route-analysis/core";
import type {
  FrameFlashState,
  RouteHighlight,
  RouteVizFrameState,
  ScreenFlash,
} from "@indoor-o-route-analysis/core/render";
import { VIZ_BIG_FLASH_DECAY_PER_FRAME, VIZ_FLASH_DECAY_PER_FRAME } from "@indoor-o-route-analysis/core/render";

/** The four selectable, combinable video segments — always shown in this order. */
export type ContentPhaseName = "shortest" | "easiest" | "human" | "all-routes";
export const CONTENT_PHASE_ORDER: ContentPhaseName[] = ["shortest", "easiest", "human", "all-routes"];

export type PhaseName = "intro" | ContentPhaseName | "outro";

export interface PhasePlan {
  name: PhaseName;
  startFrame: number;
  frameCount: number;
}

const INTRO_SECONDS = 0.6;
const OUTRO_SECONDS = 0.6;

/** Floor so a single selected phase's search+reveal animation stays legible even with a tiny --duration. */
export const MIN_PHASE_DURATION_SECONDS = 3;

/**
 * Builds the phase timeline for the selected content phases: a fixed intro,
 * each selected phase getting its own full `durationPerPhaseSeconds` of
 * animation (clamped to a legible minimum), and a fixed outro. Unlike a
 * shared total duration divided up by weight, adding more selected phases
 * lengthens the video rather than shrinking every phase's share of a fixed
 * budget.
 */
export function planPhases(selectedPhases: ContentPhaseName[], durationPerPhaseSeconds: number, fps: number): PhasePlan[] {
  const perPhaseSeconds = Math.max(MIN_PHASE_DURATION_SECONDS, durationPerPhaseSeconds);
  const order: PhaseName[] = ["intro", ...CONTENT_PHASE_ORDER.filter((p) => selectedPhases.includes(p)), "outro"];

  let cursor = 0;
  return order.map((name) => {
    const seconds = name === "intro" ? INTRO_SECONDS : name === "outro" ? OUTRO_SECONDS : perPhaseSeconds;
    const frameCount = Math.max(1, Math.round(seconds * fps));
    const plan: PhasePlan = { name, startFrame: cursor, frameCount };
    cursor += frameCount;
    return plan;
  });
}

interface CaptionPair {
  caption: string;
  subcaption?: string;
}

export interface PhaseCaptions {
  intro: CaptionPair;
  shortest: CaptionPair;
  easiest: CaptionPair;
  human: CaptionPair;
  allRoutes: CaptionPair;
  outro: CaptionPair;
}

export interface RouteColors {
  shortest: string;
  easiest: string;
  human: string;
  allRoutesPalette: string[];
  /** Big-flash color for the moment the whole all-routes search completes. */
  allRoutesFoundFlash: string;
  /** Opacity (0..1) for routes in the "all routes" swarm — see buildAllRoutesFrames. */
  allRoutesAlpha: number;
}

export interface BuildFrameStatesInput {
  selectedPhases: ContentPhaseName[];
  /** Shared search trace for shortest/easiest/all-routes (one findAllAlternativePathsBetweenControls call). */
  events: TraceEvent[];
  shortest: RouteInfo;
  easiest: RouteInfo;
  /** Every distinct route found for the leg, used to order the "all routes" reveal by length. */
  allRoutes: RouteInfo[];
  /** The simulated human route, and its own separate search trace — only needed when "human" is selected. */
  human?: RouteInfo;
  humanEvents?: TraceEvent[];
  phases: PhasePlan[];
  fps: number;
  captions: PhaseCaptions;
  routeColors: RouteColors;
}

function emptyFlash(): FrameFlashState {
  return { nodeFlash: new Map(), edgeFlash: new Map() };
}

function applyEvent(flash: FrameFlashState, event: TraceEvent): void {
  if (event.kind === "node-settled") {
    flash.nodeFlash.set(event.nodeId, 1);
  } else if (event.kind === "edge-evaluated") {
    flash.edgeFlash.set(`${event.fromNodeId}:${event.toNodeId}`, 1);
  }
}

function decay(flash: FrameFlashState): void {
  for (const [k, v] of flash.nodeFlash) {
    const next = v - VIZ_FLASH_DECAY_PER_FRAME;
    if (next <= 0) flash.nodeFlash.delete(k);
    else flash.nodeFlash.set(k, next);
  }
  for (const [k, v] of flash.edgeFlash) {
    const next = v - VIZ_FLASH_DECAY_PER_FRAME;
    if (next <= 0) flash.edgeFlash.delete(k);
    else flash.edgeFlash.set(k, next);
  }
}

function cloneFlash(flash: FrameFlashState): FrameFlashState {
  return { nodeFlash: new Map(flash.nodeFlash), edgeFlash: new Map(flash.edgeFlash) };
}

/** How many frames of a phase to reserve for holding the final reveal, given a minimum. */
function splitSearchAndHold(frameCount: number, fps: number, minHoldSeconds: number): { searchFrames: number; holdFrames: number } {
  const minHold = Math.round(minHoldSeconds * fps);
  const holdFrames = Math.min(frameCount - 1, Math.max(minHold, Math.round(frameCount * 0.3)));
  const searchFrames = Math.max(1, frameCount - holdFrames);
  return { searchFrames, holdFrames };
}

function findRouteFoundIndex(events: TraceEvent[], route: RouteInfo): number {
  return events.findIndex((e) => e.kind === "route-found" && e.route === route);
}

/**
 * A big celebratory flash — full-frame wash + shockwave ring — for the
 * frames right after a route (or the whole all-routes search) is found.
 * Decays at the same fixed per-frame rate as the search sparks, so once
 * exhausted the remaining frames simply carry no flash.
 */
function buildFlashBurst(holdFrames: number, color: string, centerNodeId: string | undefined): (ScreenFlash | undefined)[] {
  const result: (ScreenFlash | undefined)[] = [];
  let intensity = 1;
  for (let i = 0; i < holdFrames; i++) {
    if (intensity <= 0) {
      result.push(undefined);
    } else {
      result.push({ color, intensity, centerNodeId });
      intensity -= VIZ_BIG_FLASH_DECAY_PER_FRAME;
    }
  }
  return result;
}

function getPhase(phases: PhasePlan[], name: PhaseName): PhasePlan {
  const phase = phases.find((p) => p.name === name);
  if (!phase) {
    throw new Error(`Missing phase plan for "${name}" — it must be included in planPhases()'s selectedPhases`);
  }
  return phase;
}

/**
 * Replays a slice of trace events (search sub-phase) then holds a single
 * revealed route (hold sub-phase) for the remainder of the phase.
 */
function buildSingleRouteSearchFrames(
  eventsSlice: TraceEvent[],
  phase: PhasePlan,
  fps: number,
  phaseName: PhaseName,
  route: RouteInfo,
  color: string,
  searchCaption: CaptionPair,
  holdCaption: CaptionPair
): RouteVizFrameState[] {
  const { searchFrames, holdFrames } = splitSearchAndHold(phase.frameCount, fps, 1.2);
  const frames: RouteVizFrameState[] = [];
  const flash = emptyFlash();

  const eventsPerFrame = Math.max(1, Math.ceil(eventsSlice.length / searchFrames));
  let cursor = 0;
  for (let i = 0; i < searchFrames; i++) {
    for (let n = 0; n < eventsPerFrame && cursor < eventsSlice.length; n++, cursor++) {
      applyEvent(flash, eventsSlice[cursor]);
    }
    decay(flash);
    frames.push({
      phase: phaseName,
      caption: searchCaption.caption,
      subcaption: searchCaption.subcaption,
      flash: cloneFlash(flash),
      highlightedRoutes: [],
    });
  }

  const revealFrames = Math.max(1, Math.min(holdFrames, Math.round(fps * 0.5)));
  const burst = buildFlashBurst(holdFrames, color, route.path[route.path.length - 1]);
  for (let i = 0; i < holdFrames; i++) {
    decay(flash);
    const progress = Math.min(1, (i + 1) / revealFrames);
    const highlight: RouteHighlight = { path: route.path, color, progress };
    frames.push({
      phase: phaseName,
      caption: holdCaption.caption,
      subcaption: holdCaption.subcaption,
      flash: cloneFlash(flash),
      highlightedRoutes: [highlight],
      screenFlash: burst[i],
    });
  }

  return frames;
}

function buildStaticFrames(phase: PhasePlan, phaseName: PhaseName, captions: CaptionPair, highlightedRoutes: RouteHighlight[] = []): RouteVizFrameState[] {
  const frames: RouteVizFrameState[] = [];
  for (let i = 0; i < phase.frameCount; i++) {
    frames.push({
      phase: phaseName,
      caption: captions.caption,
      subcaption: captions.subcaption,
      flash: emptyFlash(),
      highlightedRoutes,
    });
  }
  return frames;
}

interface RevealedRoute {
  route: RouteInfo;
  color: string;
  startFrame: number;
}

interface AllRoutesFramesResult {
  frames: RouteVizFrameState[];
  finalHighlights: RouteHighlight[];
  finalFlash: FrameFlashState;
}

function buildAllRoutesFrames(
  events: TraceEvent[],
  allRoutes: RouteInfo[],
  phase: PhasePlan,
  fps: number,
  captions: PhaseCaptions,
  palette: string[],
  alpha: number,
  completionFlashColor: string
): AllRoutesFramesResult {
  const { searchFrames, holdFrames } = splitSearchAndHold(phase.frameCount, fps, 1.5);
  const frames: RouteVizFrameState[] = [];
  const flash = emptyFlash();
  const revealAnimFrames = Math.max(1, Math.round(fps * 0.35));

  // Reveal order: shortest to longest, evenly spaced across the search
  // sub-phase — independent of the raw search trace's discovery order, so
  // the build-up always reads as "shortest first, then progressively longer
  // alternatives," regardless of exactly when the algorithm happened to find
  // each one.
  const byLength = [...allRoutes].sort((a, b) => a.distance - b.distance);
  const revealed: RevealedRoute[] = byLength.map((route, rank) => ({
    route,
    color: palette[rank % palette.length],
    startFrame: Math.min(searchFrames - 1, Math.floor((rank / Math.max(1, byLength.length)) * searchFrames)),
  }));

  // Z-order for drawing: longest first (painted underneath), shortest last
  // (painted on top) — computed once since relative distance order is fixed.
  // Combined with partial opacity, routes sharing a corridor blend together
  // instead of the top one opaquely hiding every other route's color there.
  const zOrder = [...revealed].sort((a, b) => b.route.distance - a.route.distance);

  const eventsPerFrame = Math.max(1, Math.ceil(events.length / searchFrames));
  let cursor = 0;
  for (let i = 0; i < searchFrames; i++) {
    for (let n = 0; n < eventsPerFrame && cursor < events.length; n++, cursor++) {
      applyEvent(flash, events[cursor]);
    }
    decay(flash);
    const highlightedRoutes: RouteHighlight[] = zOrder
      .filter((r) => r.startFrame <= i)
      .map((r) => ({
        path: r.route.path,
        color: r.color,
        alpha,
        progress: Math.min(1, (i - r.startFrame + 1) / revealAnimFrames),
      }));
    frames.push({
      phase: "all-routes",
      caption: captions.allRoutes.caption,
      subcaption: captions.allRoutes.subcaption,
      flash: cloneFlash(flash),
      highlightedRoutes,
    });
  }

  const finalHighlights: RouteHighlight[] = zOrder.map((r) => ({
    path: r.route.path,
    color: r.color,
    alpha,
    progress: 1,
  }));

  const destinationNodeId = byLength[0]?.path[byLength[0].path.length - 1];
  const burst = buildFlashBurst(holdFrames, completionFlashColor, destinationNodeId);
  for (let i = 0; i < holdFrames; i++) {
    decay(flash);
    frames.push({
      phase: "all-routes",
      caption: captions.allRoutes.caption,
      subcaption: captions.allRoutes.subcaption,
      flash: cloneFlash(flash),
      highlightedRoutes: finalHighlights,
      screenFlash: burst[i],
    });
  }

  return { frames, finalHighlights, finalFlash: cloneFlash(flash) };
}

/**
 * Builds the full per-frame render state for the video, given the recorded
 * search trace(s) and the routes within them, for whichever content phases
 * were selected. Pure function — no canvas/ffmpeg dependency, easily
 * unit-testable.
 */
export function buildFrameStates(input: BuildFrameStatesInput): RouteVizFrameState[] {
  const { selectedPhases, events, shortest, easiest, allRoutes, human, humanEvents, phases, fps, captions, routeColors } = input;
  const frames: RouteVizFrameState[] = [];

  const introPhase = getPhase(phases, "intro");
  frames.push(...buildStaticFrames(introPhase, "intro", captions.intro));

  // Carried forward into the outro so it holds on whatever the last selected
  // phase left on screen, rather than assuming any particular phase ran.
  let lastHighlights: RouteHighlight[] = [];
  let lastFlash: FrameFlashState = emptyFlash();

  if (selectedPhases.includes("shortest")) {
    const shortestFoundIdx = findRouteFoundIndex(events, shortest);
    const shortestSlice = events.slice(0, shortestFoundIdx + 1);
    const shortestFrames = buildSingleRouteSearchFrames(
      shortestSlice,
      getPhase(phases, "shortest"),
      fps,
      "shortest",
      shortest,
      routeColors.shortest,
      { caption: captions.shortest.caption, subcaption: "Searching…" },
      captions.shortest
    );
    frames.push(...shortestFrames);
    const last = shortestFrames[shortestFrames.length - 1];
    lastHighlights = last.highlightedRoutes;
    lastFlash = last.flash;
  }

  if (selectedPhases.includes("easiest")) {
    const sameAsShortest = easiest.path.length === shortest.path.length && easiest.path.every((id, i) => id === shortest.path[i]);
    const easiestPhase = getPhase(phases, "easiest");
    const easiestFrames = sameAsShortest
      ? buildStaticFrames(easiestPhase, "easiest", captions.easiest, [
          { path: easiest.path, color: routeColors.easiest, progress: 1 },
        ])
      : buildSingleRouteSearchFrames(
          events.slice(0, findRouteFoundIndex(events, easiest) + 1),
          easiestPhase,
          fps,
          "easiest",
          easiest,
          routeColors.easiest,
          { caption: captions.easiest.caption, subcaption: "Searching…" },
          captions.easiest
        );
    frames.push(...easiestFrames);
    const last = easiestFrames[easiestFrames.length - 1];
    lastHighlights = last.highlightedRoutes;
    lastFlash = last.flash;
  }

  if (selectedPhases.includes("human") && human) {
    const humanFrames = buildSingleRouteSearchFrames(
      humanEvents ?? [],
      getPhase(phases, "human"),
      fps,
      "human",
      human,
      routeColors.human,
      { caption: captions.human.caption, subcaption: "Planning…" },
      captions.human
    );
    frames.push(...humanFrames);
    const last = humanFrames[humanFrames.length - 1];
    lastHighlights = last.highlightedRoutes;
    lastFlash = last.flash;
  }

  if (selectedPhases.includes("all-routes")) {
    const allRoutesResult = buildAllRoutesFrames(
      events,
      allRoutes,
      getPhase(phases, "all-routes"),
      fps,
      captions,
      routeColors.allRoutesPalette,
      routeColors.allRoutesAlpha,
      routeColors.allRoutesFoundFlash
    );
    frames.push(...allRoutesResult.frames);
    lastHighlights = allRoutesResult.finalHighlights;
    lastFlash = allRoutesResult.finalFlash;
  }

  const outroPhase = getPhase(phases, "outro");
  for (let i = 0; i < outroPhase.frameCount; i++) {
    frames.push({
      phase: "outro",
      caption: captions.outro.caption,
      subcaption: captions.outro.subcaption,
      flash: cloneFlash(lastFlash),
      highlightedRoutes: lastHighlights,
    });
  }

  return frames;
}
