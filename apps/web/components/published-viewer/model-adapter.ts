import {
  findPolygonForPoint,
  type EventData,
  type MapData,
  type RaceCourseData,
} from "@indoor-o-route-analysis/core";
import type { RouteHighlight } from "@indoor-o-route-analysis/core/render";
import type { RouteSegment } from "@/components/route-analysis/3d-elements";

/** The editor's shared 3D components read the active race/map from index zero. */
export function createPublishedScene(
  event: EventData,
  race: RaceCourseData,
  map: MapData,
  routes: RouteHighlight[],
) {
  const points = new Map(
    (race.controls ?? []).map((control) => [control.id, control.mapPosition]),
  );
  for (const node of race.vertices ?? [])
    points.set(node.id, { x: node.x, y: node.y });
  const segments: RouteSegment[] = [];
  for (const route of routes) {
    let level = 0;
    let current: RouteSegment | undefined;
    for (let index = 1; index < route.path.length; index++) {
      const from = points.get(route.path[index - 1]),
        to = points.get(route.path[index]);
      if (!from || !to) continue;
      const edge = race.edges?.find(
        (edge) =>
          (edge.from === route.path[index - 1] &&
            edge.to === route.path[index]) ||
          (edge.to === route.path[index - 1] &&
            edge.from === route.path[index]),
      );
      level = findPolygonForPoint(from, race.polygons ?? [])?.level ?? level;
      const nextLevel =
        findPolygonForPoint(to, race.polygons ?? [])?.level ?? level;
      const ignoreLength = !!edge?.ignoreLength;
      if (current && current.isIgnoreLength === ignoreLength)
        current.points.push({ ...to, level: nextLevel });
      else {
        current = {
          points: [
            { ...from, level },
            { ...to, level: nextLevel },
          ],
          isIgnoreLength: ignoreLength,
          isMapSegmentTransition: ignoreLength,
          color: route.color,
        };
        segments.push(current);
      }
      level = nextLevel;
    }
  }
  return {
    event: { ...event, raceCourses: [{ ...race, maps: [map] }] },
    segments,
  };
}
