import type { RouteInfo } from './route-analyzer';

export type RecommendationReason = 'simple' | 'fewest floors' | 'shortest';
export interface RecommendationMetrics {
  navigationCost: number;
  floors: number;
  ascent: number;
  descent: number;
  transitions: number;
}
export interface Recommendation {
  reasons: RecommendationReason[];
  metrics: RecommendationMetrics;
  variants: RouteInfo[];
  variantReasons: RecommendationReason[];
}
export interface RoutePoint { x: number; y: number; level: number }
export const ROUTE_SIMILARITY = { proximityMeters: 5, maxDistanceDifferenceMeters: 10, maxDistanceDifferenceRatio: 0.05 };

export function compareCosts(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Conservative geometric comparison in meters, independent of labels and node density.
 * Compare each same-floor run separately so different floor strategies cannot merge.
 * Sampling at fixed arclength bounds local deviations, including zero-length stairs.
 */
export function similarRouteGeometry(a: RoutePoint[], b: RoutePoint[]): boolean {
  const runs = (points: RoutePoint[]) => {
    const result: RoutePoint[][] = [];
    for (const p of points) {
      if (!result.length || result[result.length - 1][0].level !== p.level) result.push([]);
      result[result.length - 1].push(p);
    }
    return result;
  };
  const ar = runs(a), br = runs(b);
  if (ar.length !== br.length) return false;
  const distance = (p: RoutePoint, q: RoutePoint) => Math.hypot(p.x - q.x, p.y - q.y);
  const directed = (source: RoutePoint[], target: RoutePoint[]) => {
    const near = (p: RoutePoint) => {
      let best = distance(p, target[0]);
      for (let i = 1; i < target.length; i++) {
        const u = target[i - 1], v = target[i];
        const dx = v.x - u.x, dy = v.y - u.y;
        const t = Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy));
      }
      return best <= ROUTE_SIMILARITY.proximityMeters;
    };
    if (!near(source[0])) return false;
    for (let i = 1; i < source.length; i++) {
      const u = source[i - 1], v = source[i];
      const steps = Math.max(1, Math.ceil(distance(u, v) / 2));
      for (let j = 1; j <= steps; j++) if (!near({ ...u, x: u.x + (v.x - u.x) * j / steps, y: u.y + (v.y - u.y) * j / steps })) return false;
    }
    return true;
  };
  return ar.every((run, i) => run[0].level === br[i][0].level &&
    distance(run[0], br[i][0]) <= ROUTE_SIMILARITY.proximityMeters &&
    distance(run[run.length - 1], br[i][br[i].length - 1]) <= ROUTE_SIMILARITY.proximityMeters &&
    directed(run, br[i]) && directed(br[i], run));
}

export function selectRouteRecommendations(
  candidates: RouteInfo[],
  metrics: (route: RouteInfo) => RecommendationMetrics,
  geometry: (route: RouteInfo) => RoutePoint[],
  k = 6,
): RouteInfo[] {
  const entries = [...new Map(candidates.map(r => [JSON.stringify(r.path), r])).values()].map(route => ({ route, m: metrics(route), points: geometry(route) }));
  if (!entries.length) return [];
  const stable = (a: typeof entries[number], b: typeof entries[number]) => JSON.stringify(a.points).localeCompare(JSON.stringify(b.points)) || JSON.stringify(a.route.path).localeCompare(JSON.stringify(b.route.path));
  const simple = (a: typeof entries[number], b: typeof entries[number]) => compareCosts([a.m.navigationCost, a.m.floors, a.route.distance], [b.m.navigationCost, b.m.floors, b.route.distance]) || stable(a, b);
  const ordered = [...entries].sort(simple);
  const winners = [ordered[0], [...entries].sort((a, b) => compareCosts([a.m.floors, a.route.distance], [b.m.floors, b.route.distance]) || stable(a,b))[0], [...entries].sort((a, b) => a.route.distance - b.route.distance || stable(a,b))[0]];
  const reasons: RecommendationReason[] = ['simple', 'fewest floors', 'shortest'];
  // Dominance determines priority, not eligibility: a different corridor or
  // stair strategy can still be useful even when these three costs are higher.
  const isDominated = (entry: typeof entries[number]) => entries.some(other =>
    other.m.navigationCost <= entry.m.navigationCost && other.m.floors <= entry.m.floors && other.route.distance <= entry.route.distance &&
    (other.m.navigationCost < entry.m.navigationCost || other.m.floors < entry.m.floors || other.route.distance < entry.route.distance));
  const additional = [
    ...ordered.filter(entry => !isDominated(entry)),
    ...ordered.filter(isDominated),
  ];
  const selected: typeof entries = [];
  for (const entry of [...winners, ...additional]) {
    if (selected.includes(entry)) continue;
    const group = selected.find(other => other.m.navigationCost === entry.m.navigationCost && other.m.floors === entry.m.floors &&
      Math.abs(other.route.distance - entry.route.distance) <= Math.min(ROUTE_SIMILARITY.maxDistanceDifferenceMeters, ROUTE_SIMILARITY.maxDistanceDifferenceRatio * Math.max(other.route.distance, entry.route.distance)) && similarRouteGeometry(other.points, entry.points));
    if (group) {
      if (!group.route.recommendation!.variants.some(r => r.path.join() === entry.route.path.join())) group.route.recommendation!.variants.push(entry.route);
    } else if (selected.length < Math.max(3, k)) {
      entry.route = { ...entry.route, recommendation: { reasons: [], metrics: entry.m, variants: [], variantReasons: [] } };
      selected.push(entry);
    }
  }
  for (const entry of selected) {
    const info = entry.route.recommendation!;
    winners.forEach((winner, i) => {
      if (winner === entry) info.reasons.push(reasons[i]);
      else if (info.variants.includes(winner.route)) info.variantReasons.push(reasons[i]);
    });
  }
  return selected.map(e => e.route);
}

/** Lexicographic Dijkstra: no arbitrary large weight can suppress an objective. */
export function findObjectivePath(
  start: string, end: string,
  graph: Map<string, Map<string, number[]>>,
): string[] | undefined {
  const costs = new Map<string, number[]>([[start, [0, 0, 0]]]);
  const previous = new Map<string, string>();
  const pending = new Set(graph.keys());
  while (pending.size) {
    let current: string | undefined;
    for (const id of pending) if (costs.has(id) && (current === undefined || compareCosts(costs.get(id)!, costs.get(current)!) < 0)) current = id;
    if (current === undefined) return;
    if (current === end) {
      const path = [end];
      while (path[0] !== start) path.unshift(previous.get(path[0])!);
      return path;
    }
    pending.delete(current);
    for (const [next, weight] of graph.get(current) ?? []) {
      if (!pending.has(next)) continue;
      const cost = costs.get(current)!.map((v, i) => v + weight[i]);
      if (!costs.has(next) || compareCosts(cost, costs.get(next)!) < 0) {
        costs.set(next, cost);
        previous.set(next, current);
      }
    }
  }
}
