import type {
  Course,
  CustomRoute,
  RecommendationReason,
  RouteAnalyzer,
  RouteInfo,
  RouteLeg,
} from "@indoor-o-route-analysis/core";
export function makeDraft(course: Course, id: string): CustomRoute {
  return {
    id,
    name: "我的路线",
    courseId: course.id,
    legs: course.controls.slice(1).map((c, i) => ({
      fromControlId: course.controls[i].controlId,
      toControlId: c.controlId,
      path: [],
    })),
  };
}
export function buildLeg(
  analyzer: RouteAnalyzer,
  from: string,
  to: string,
  via: string[],
): RouteLeg {
  const stops = [from, ...via, to],
    path: string[] = [];
  for (let i = 1; i < stops.length; i++) {
    const result = analyzer.dijkstra(stops[i - 1], stops[i]);
    if (!result)
      throw Error(`节点 ${stops[i - 1]} → ${stops[i]} 不连通或禁止此方向通行`);
    path.push(...result.path.slice(i === 1 ? 0 : 1));
  }
  return {
    fromControlId: from,
    toControlId: to,
    path: path.map((nodeId) => ({ nodeId })),
  };
}

/** Metrics use the same distance/scoring functions as the editor; time is an estimate at the visible speed. */
export interface PublishedRouteMetrics {
  distance: number;
  distanceDelta: number;
  distanceRatio: number | null;
  estimatedTime: number;
  timeDelta: number;
  difficulty: number;
  difficultyFormula?: string;
  description: string;
  totalClimb?: number;
  labels?: string[];
  reasons?: RecommendationReason[];
  branchingPoints?: number;
  decisionPoints?: number;
  stairs?: number;
  repetitionRatio?: number;
  floors?: number;
  nearbyVariants?: number;
}
export interface PublishedLegAnalysis {
  bestDistance: number;
  leg: RouteLeg;
  candidates: RouteLeg[];
  candidateMetrics: PublishedRouteMetrics[];
  previewMetrics: PublishedRouteMetrics;
}
function validateSpeed(speed: number) {
  if (!Number.isFinite(speed) || speed <= 0)
    throw Error("速度必须是大于零的有限数值（米/秒）");
}
function distanceMetrics(
  distance: number,
  bestDistance: number,
  runningSpeed: number,
) {
  validateSpeed(runningSpeed);
  return {
    distance,
    distanceDelta: distance - bestDistance,
    distanceRatio: bestDistance > 0 ? distance / bestDistance : null,
    estimatedTime: distance / runningSpeed,
    timeDelta: (distance - bestDistance) / runningSpeed,
  };
}
export function measurePublishedLeg(
  analyzer: RouteAnalyzer,
  leg: RouteLeg,
  bestDistance: number,
  runningSpeed = 3,
): PublishedRouteMetrics {
  // The deployed 0.2.5-test.2 Analysis scores a control-wrapped graph path.
  // Preserve that exact convention for metrics; editing/export still use the legal normalized path.
  const normalized = leg.path
    .map((node) => node.nodeId)
    .filter((id, i, path) => !i || id !== path[i - 1]);
  const path = normalized.length
    ? [leg.fromControlId, ...normalized, leg.toControlId]
    : [];
  const analysis = analyzer.analyzeRoute(path);
  return {
    ...distanceMetrics(
      analyzer.calculatePathDistance(path),
      bestDistance,
      runningSpeed,
    ),
    difficulty: analyzer.calculatePathDifficulty(path),
    description: analyzer.getRouteLabels(path).join(", "),
    labels: analyzer.getRouteLabels(path),
    branchingPoints: analysis.branchingPointNodeIds.length,
    decisionPoints: analysis.decisionPoints,
    stairs: analyzer.countIgnoreLengthEdgesInPath(path),
  };
}
function toLeg(route: RouteInfo, from: string, to: string): RouteLeg {
  // The shared analyzer wraps paths with controls even when controls already are graph nodes.
  // Only remove consecutive duplicates; keep every actual turn and graph edge.
  return {
    fromControlId: from,
    toControlId: to,
    path: route.path
      .filter((id, i, path) => !i || id !== path[i - 1])
      .map((nodeId) => ({ nodeId })),
  };
}
function candidateRoutes(
  analyzer: RouteAnalyzer,
  from: string,
  to: string,
): RouteInfo[] {
  // Release 0.2.5-test.2: keep objective order and nearby groups from the shared selector.
  return analyzer.findRecommendedPathsBetweenControls(from, to, 6);
}
export function exploreLegs(
  analyzer: RouteAnalyzer,
  from: string,
  to: string,
): RouteLeg[] {
  return candidateRoutes(analyzer, from, to).map((route) =>
    toLeg(route, from, to),
  );
}
/** Include hidden variants when determining the distance baseline, exactly as course-analysis.ts. */
function shortestRecommended(routes: RouteInfo[]): RouteInfo | undefined {
  return routes
    .flatMap((route) => [route, ...(route.recommendation?.variants ?? [])])
    .reduce<RouteInfo | undefined>(
      (best, route) => (!best || route.distance < best.distance ? route : best),
      undefined,
    );
}
export function previousShortestPathsForLeg(
  analyzer: RouteAnalyzer,
  course: Pick<Course, "controls">,
  legIndex: number,
): string[][] {
  if (
    !Number.isInteger(legIndex) ||
    legIndex < 0 ||
    legIndex >= course.controls.length - 1
  )
    throw Error("赛段索引无效");
  const previous: string[][] = [];
  for (let i = 0; i < legIndex; i++) {
    const from = course.controls[i].controlId,
      to = course.controls[i + 1].controlId;
    if (from === to) continue;
    const best = shortestRecommended(candidateRoutes(analyzer, from, to));
    if (best) previous.push(best.path);
  }
  return previous;
}
export function analyzePublishedLeg(
  analyzer: RouteAnalyzer,
  from: string,
  to: string,
  via: string[] = [],
  runningSpeed = 3,
  options: {
    previousShortestPaths?: string[][];
    includeVariants?: boolean;
  } = {},
): PublishedLegAnalysis {
  validateSpeed(runningSpeed);
  const recommended = candidateRoutes(analyzer, from, to);
  const best = shortestRecommended(recommended);
  if (!best) throw Error(`节点 ${from} → ${to} 不连通或禁止此方向通行`);
  const routes = [...recommended];
  if (options.includeVariants) {
    const seen = new Set(
      routes.map((route) => JSON.stringify(toLeg(route, from, to).path)),
    );
    for (const parent of recommended)
      for (const variant of parent.recommendation?.variants ?? []) {
        const key = JSON.stringify(toLeg(variant, from, to).path);
        if (!seen.has(key)) {
          seen.add(key);
          routes.push(variant);
        }
      }
  }
  const bestDistance = best.distance;
  const candidates = routes.map((route) => toLeg(route, from, to));
  const previous = options.previousShortestPaths ?? [];
  const candidateMetrics: PublishedRouteMetrics[] = routes.map((route) => ({
    ...distanceMetrics(route.distance, bestDistance, runningSpeed),
    difficulty: route.difficulty,
    difficultyFormula: route.difficultyFormula,
    description: route.description,
    labels: route.labels,
    totalClimb: route.totalClimb,
    reasons: route.recommendation?.reasons ?? [],
    branchingPoints: route.branchingPointNodeIds.length,
    decisionPoints: route.decisionPoints,
    stairs: route.ignoreLengthEdges,
    repetitionRatio: analyzer.calculateRepetitionRatio(route.path, previous),
    floors: route.recommendation?.metrics.floors,
    nearbyVariants: route.recommendation?.variants.length ?? 0,
  }));
  const leg = via.length ? buildLeg(analyzer, from, to, via) : candidates[0];
  return {
    leg,
    candidates,
    candidateMetrics,
    bestDistance,
    previewMetrics: via.length
      ? {
          ...measurePublishedLeg(analyzer, leg, bestDistance, runningSpeed),
          repetitionRatio: analyzer.calculateRepetitionRatio(
            leg.path.map((node) => node.nodeId),
            previous,
          ),
        }
      : candidateMetrics[0],
  };
}
