import type { RouteInfo } from "./route-analyzer";
import type {
  EdgeEvaluatedEvent,
  NodeSettledEvent,
  RouteAnalyzerVisualizer,
  RouteFoundEvent,
} from "./route-analyzer-visualizer";

export type TraceEvent =
  | ({ kind: "node-settled"; seq: number } & NodeSettledEvent)
  | ({ kind: "edge-evaluated"; seq: number } & EdgeEvaluatedEvent)
  | ({ kind: "route-found"; seq: number } & RouteFoundEvent);

export interface TraceRecorderOptions {
  /** Safety cap on low-level (node/edge) events; route-found events are never capped. */
  maxLowLevelEvents?: number;
}

const DEFAULT_MAX_LOW_LEVEL_EVENTS = 50_000;

/**
 * Records a deterministic, replayable sequence of RouteAnalyzer visualization
 * events with monotonic sequence numbers. Pure data — no canvas/DOM/timing
 * dependency — usable from Node CLIs and the browser alike.
 */
export class TraceRecorder implements RouteAnalyzerVisualizer {
  readonly events: TraceEvent[] = [];
  readonly routes: RouteInfo[] = [];

  private seq = 0;
  private lowLevelCount = 0;
  private readonly maxLowLevelEvents: number;
  private truncated = false;

  constructor(options: TraceRecorderOptions = {}) {
    this.maxLowLevelEvents = options.maxLowLevelEvents ?? DEFAULT_MAX_LOW_LEVEL_EVENTS;
  }

  onNodeSettled(event: NodeSettledEvent): void {
    if (!this.reserveLowLevelSlot()) return;
    this.events.push({ kind: "node-settled", seq: this.seq++, ...event });
  }

  onEdgeEvaluated(event: EdgeEvaluatedEvent): void {
    if (!this.reserveLowLevelSlot()) return;
    this.events.push({ kind: "edge-evaluated", seq: this.seq++, ...event });
  }

  onRouteFound(event: RouteFoundEvent): void {
    // Route-found events are never capped — they drive the actually displayed routes.
    this.events.push({ kind: "route-found", seq: this.seq++, ...event });
    this.routes.push(event.route);
  }

  get isTruncated(): boolean {
    return this.truncated;
  }

  private reserveLowLevelSlot(): boolean {
    if (this.lowLevelCount >= this.maxLowLevelEvents) {
      if (!this.truncated) {
        this.truncated = true;
        console.warn(
          `TraceRecorder: hit maxLowLevelEvents (${this.maxLowLevelEvents}); further node/edge events dropped (route-found events unaffected).`
        );
      }
      return false;
    }
    this.lowLevelCount++;
    return true;
  }
}
