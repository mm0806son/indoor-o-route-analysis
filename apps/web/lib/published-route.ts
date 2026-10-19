import type {
  Course,
  CustomRoute,
  RouteAnalyzer,
  RouteLeg,
} from '@indoor-o-route-analysis/core';
export function makeDraft(course: Course, id: string): CustomRoute {
  return {
    id,
    name: '我的路线',
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

/** At most 12 shortest-path runs; no exhaustive path enumeration. */
export function exploreLegs(
  analyzer: RouteAnalyzer,
  from: string,
  to: string,
): RouteLeg[] {
  const results: RouteLeg[] = [],
    seen = new Set<string>(),
    penalties = new Map<string, number>();
  for (let i = 0; i < 12 && results.length < 4; i++) {
    const candidate = analyzer.dijkstra(from, to, penalties);
    if (!candidate) break;
    const key = JSON.stringify(candidate.path);
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        fromControlId: from,
        toControlId: to,
        path: candidate.path.map((nodeId) => ({ nodeId })),
      });
    }
    for (let j = 1; j < candidate.path.length; j++) {
      const a = candidate.path[j - 1],
        b = candidate.path[j];
      for (const edge of [`${a}:${b}`, `${b}:${a}`])
        penalties.set(edge, (penalties.get(edge) ?? 1) * 2);
    }
  }
  return results.sort(
    (a, b) =>
      analyzer.calculatePathDistance(a.path.map((n) => n.nodeId)) -
      analyzer.calculatePathDistance(b.path.map((n) => n.nodeId)),
  );
}
