import type {
  Course,
  CustomRoute,
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
}
export interface PublishedLegAnalysis {
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
  runningSpeed = 5,
): PublishedRouteMetrics {
  const path = leg.path.map((node) => node.nodeId);
  return {
    ...distanceMetrics(
      analyzer.calculatePathDistance(path),
      bestDistance,
      runningSpeed,
    ),
    difficulty: analyzer.calculatePathDifficulty(path),
    description: analyzer.getRouteDescription(path),
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
  const seen = new Set<string>();
  // Exactly the editor Analysis search: bounded internally by 200 penalty iterations.
  // Do not substitute different penalties, exhaustive enumeration, or invented extra routes.
  return analyzer
    .findAlternativePathsBetweenControls(from, to, 6)
    .sort((a, b) => a.distance - b.distance)
    .filter((route) => {
      const key = JSON.stringify(toLeg(route, from, to).path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
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
export function analyzePublishedLeg(
  analyzer: RouteAnalyzer,
  from: string,
  to: string,
  via: string[] = [],
  runningSpeed = 5,
): PublishedLegAnalysis {
  validateSpeed(runningSpeed);
  const routes = candidateRoutes(analyzer, from, to);
  if (!routes.length)
    throw Error(`节点 ${from} → ${to} 不连通或禁止此方向通行`);
  const bestDistance = routes[0].distance;
  const candidates = routes.map((route) => toLeg(route, from, to));
  const candidateMetrics = routes.map((route, i) => ({
    ...measurePublishedLeg(analyzer, candidates[i], bestDistance, runningSpeed),
    // Climb is unaffected by removing consecutive duplicate controls. Difficulty is not:
    // use the normalized path just like the original Route Builder, not the wrapped Analysis path.
    totalClimb: route.totalClimb,
  }));
  const leg = via.length ? buildLeg(analyzer, from, to, via) : candidates[0];
  return {
    leg,
    candidates,
    candidateMetrics,
    previewMetrics: via.length
      ? measurePublishedLeg(analyzer, leg, bestDistance, runningSpeed)
      : candidateMetrics[0],
  };
}
