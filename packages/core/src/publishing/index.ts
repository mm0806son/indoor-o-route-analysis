import { z } from "zod";
import { eventPosToMultiPagePixels } from "../map-coordinates";
import type { EventData, RaceCourseData } from "../models/event";
import type { Node } from "../models/graph";
import type { CustomRoute } from "../models/route";
import { RouteAnalyzer } from "../route-analyzer";
import { hasStairPort, normalizeStairCode } from "../stairs";
import { findEdgeByNodes } from "../utils/graph-utils";
import { validatePublishedMapGeometry } from "./geometry-validation";

const id = z.string().min(1);
const publicId = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Use only letters, numbers, hyphens and underscores",
  );
const finite = z.number().finite();
const point = z.object({ x: finite, y: finite });
const relativePath = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/,
    "Resource path must be relative",
  )
  .refine((p) => !p.split("/").some((s) => s === "." || s === ".."));
const embeddedImage = z
  .string()
  .regex(
    /^(?:data:(?:image\/(?:png|jpeg|jpg|gif|webp)|application\/pdf);base64,)?[A-Za-z0-9+/]+={0,2}$/,
    "Use an embedded PNG, JPEG, GIF, WebP or PDF",
  );
const mapSchema = z.object({
  id: id,
  scale: finite.positive(),
  image: z
    .object({
      encodedData: embeddedImage.optional(),
      url: relativePath.optional(),
      mediaType: z
        .enum([
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/gif",
          "image/webp",
          "application/pdf",
        ])
        .optional(),
      width: finite.positive(),
      height: finite.positive(),
      resolution: finite.positive().optional(),
    })
    .refine((i) => !!(i.encodedData || i.url), "Map image is missing"),
  mapPositionTopLeft: point,
  mapPositionBottomRight: point.optional(),
  layout: z.enum(["horizontal", "vertical", "pages"]),
  pageCount: z.number().int().positive().optional(),
  pageTransformMode: z.enum(["automatic", "manual"]).optional(),
  pageTransforms: z
    .array(z.object({ topLeft: point, bottomRight: point }))
    .optional(),
});
const routeSchema = z.object({
  id,
  name: z.string(),
  courseId: id,
  legs: z.array(
    z.object({
      fromControlId: id,
      toControlId: id,
      path: z.array(
        z.object({ nodeId: id, legTime: finite.nonnegative().optional() }),
      ),
    }),
  ),
});
const raceSchema = z.object({
  stairFloorOrder: z.array(finite).optional(),
  courses: z.array(
    z.object({
      id,
      name: z.string(),
      mapId: id,
      controls: z.array(
        z.object({
          controlId: id,
          mapText: z.string().optional(),
          type: z.enum(["start", "control", "finish"]).optional(),
        }),
      ),
    }),
  ),
  controls: z.array(
    z.object({
      id,
      type: z.enum(["start", "control", "finish"]),
      mapPosition: point,
      mapText: z.string().optional(),
    }),
  ),
  vertices: z.array(
    point.extend({
      id,
      stair: z
        .object({
          code: id,
          floor: finite,
          port: z.enum(["up", "down", "both"]),
        })
        .optional(),
    }),
  ),
  edges: z.array(
    z.object({
      from: id,
      to: id,
      label: z.string(),
      reverseLabel: z.string().optional(),
      oneWay: z.boolean().optional(),
      ignoreLength: z.boolean().optional(),
    }),
  ),
  maps: z.array(mapSchema),
  polygons: z
    .array(
      z.object({
        id,
        points: z.array(point),
        holes: z.array(z.array(point)).optional(),
        level: finite,
        elevation: finite.optional(),
        origin: point.optional(),
      }),
    )
    .optional(),
});
const publishedSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: publicId,
  revision: publicId,
  event: z.object({
    id,
    name: z.string(),
    country: z.enum(["norway", "sweden", ""]),
    startTime: z.object({ date: z.string(), time: z.string().optional() }),
    raceCourses: z.array(raceSchema).min(1),
  }),
  recommendations: z.array(routeSchema),
});
export interface PublishedEvent {
  schemaVersion: 1;
  eventId: string;
  revision: string;
  event: EventData;
  recommendations: CustomRoute[];
}
export interface PublicationManifest {
  schemaVersion: 1;
  currentEventId: string | null;
  events: { eventId: string; revision: string; path: string }[];
}
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  currentEventId: publicId.nullable(),
  events: z.array(
    z.object({ eventId: publicId, revision: publicId, path: relativePath }),
  ),
});
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${label}`);
}
export function parsePublicationManifest(input: unknown): PublicationManifest {
  const value = manifestSchema.parse(input);
  unique(
    value.events.map((e) => e.eventId),
    "event IDs",
  );
  if (
    value.currentEventId !== null &&
    !value.events.some((e) => e.eventId === value.currentEventId)
  )
    throw new Error("Current event is not public");
  return value;
}
export function createPublicationManifest(
  events: PublishedEvent[],
  currentEventId: string | null,
): PublicationManifest {
  return parsePublicationManifest({
    schemaVersion: 1,
    currentEventId,
    events: events.map((e) => ({
      eventId: e.eventId,
      revision: e.revision,
      path: `events/${e.eventId}/${e.revision}.json`,
    })),
  });
}
export function parsePublishedEvent(input: unknown): PublishedEvent {
  const value: PublishedEvent = publishedSchema.parse(input);
  const courses: string[] = [];
  for (const race of value.event.raceCourses!) {
    const controls = race.controls!,
      vertices = race.vertices!,
      maps = race.maps!;
    unique(
      controls.map((c) => c.id),
      "controls",
    );
    unique(
      vertices.map((n) => n.id),
      "nodes",
    );
    unique(
      maps.map((m) => m.id!),
      "maps",
    );
    for (const map of maps) validatePublishedMapGeometry(map);
    for (const vertex of vertices) {
      const control = controls.find((c) => c.id === vertex.id);
      if (
        control &&
        (vertex.x !== control.mapPosition.x ||
          vertex.y !== control.mapPosition.y)
      )
        throw new Error("Node and control coordinates conflict");
    }
    const nodeIds = new Set([
      ...controls.map((c) => c.id),
      ...vertices.map((n) => n.id),
    ]);
    const directedEdges: string[] = [];
    for (const edge of race.edges!) {
      directedEdges.push(JSON.stringify([edge.from, edge.to]));
      if (!edge.oneWay && edge.from !== edge.to)
        directedEdges.push(JSON.stringify([edge.to, edge.from]));
    }
    unique(directedEdges, "directed edges");
    for (const edge of race.edges!)
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
        throw new Error("Edge references a missing node");
    for (const course of race.courses!) {
      courses.push(course.id);
      if (course.controls.length < 2)
        throw new Error("Course needs a start and finish");
      if (!maps.some((m) => m.id === course.mapId))
        throw new Error("Course map is missing");
      for (const c of course.controls)
        if (!controls.some((control) => control.id === c.controlId))
          throw new Error("Course control is missing");
    }
  }
  unique(courses, "course IDs");
  if (!courses.length) throw new Error("Select at least one course");
  unique(
    value.recommendations.map((r) => r.id),
    "recommendations",
  );
  for (const route of value.recommendations)
    validatePublishedRoute(value, route);
  return value;
}
export function createPublishedEvent(
  event: EventData,
  options: {
    eventId: string;
    revision: string;
    courseIds: string[];
    recommendedRouteIds?: string[];
  },
): PublishedEvent {
  const selected = new Set(options.courseIds);
  if (!selected.size) throw new Error("Select at least one course");
  const recommendations: CustomRoute[] = [];
  const raceCourses = (event.raceCourses ?? []).flatMap((race, raceIndex) => {
    // The editor falls back to its sole map for historical saved courses with a stale mapId.
    // Only normalize an unambiguous single-map race; never guess between different maps.
    const maps = (race.maps ?? []).map((map, mapIndex) => ({
      ...map,
      id: map.id || `map-${raceIndex}-${mapIndex}`,
    }));
    const courses = (race.courses ?? [])
      .filter((c) => selected.has(c.id))
      .map((course) =>
        maps.length === 1 && !maps.some((map) => map.id === course.mapId)
          ? { ...course, mapId: maps[0].id }
          : course,
      );
    if (!courses.length) return [];
    const mapIds = new Set(courses.map((c) => c.mapId));
    recommendations.push(
      ...(race.customRoutes ?? []).filter(
        (r) =>
          (options.recommendedRouteIds ?? []).includes(r.id) &&
          courses.some((c) => c.id === r.courseId),
      ),
    );
    return [
      {
        ...race,
        courses,
        maps: maps
          .filter((m) => mapIds.has(m.id ?? ""))
          .map((m) => ({
            ...m,
            image: {
              ...m.image,
              url: m.image.encodedData ? undefined : m.image.url,
            },
          })),
        controls: race.controls ?? [],
        vertices: race.vertices ?? [],
        edges: race.edges ?? [],
        customRoutes: undefined,
      },
    ];
  });
  if (raceCourses.flatMap((r) => r.courses).length !== selected.size)
    throw new Error("Selected course is missing");
  if (
    recommendations.length !== new Set(options.recommendedRouteIds ?? []).size
  )
    throw new Error(
      "Recommended route is missing or belongs to an unselected course",
    );
  const result = parsePublishedEvent({
    schemaVersion: 1,
    eventId: options.eventId,
    revision: options.revision,
    event: { ...event, raceCourses },
    recommendations,
  });
  for (const race of result.event.raceCourses ?? [])
    for (const course of race.courses ?? []) {
      const analyzer = createPublishedRouteAnalyzer(result, course.id);
      for (let i = 1; i < course.controls.length; i++)
        if (
          !analyzer.dijkstra(
            course.controls[i - 1].controlId,
            course.controls[i].controlId,
          )
        )
          throw new Error(
            `Course ${course.name}, leg ${i}: controls are not connected`,
          );
    }
  return result;
}
function courseContext(published: PublishedEvent, courseId: string) {
  const race = published.event.raceCourses?.find((r) =>
    r.courses?.some((c) => c.id === courseId),
  );
  const course = race?.courses?.find((c) => c.id === courseId);
  if (!race || !course) throw new Error("Course is missing");
  const map = race.maps?.find((m) => m.id === course.mapId);
  if (!map) throw new Error("Course map is missing");
  return { race, course, map };
}
export function createPublishedRouteAnalyzer(
  published: PublishedEvent,
  courseId: string,
): RouteAnalyzer {
  const { race, map } = courseContext(published, courseId);
  return new RouteAnalyzer(
    race.controls ?? [],
    race.vertices ?? [],
    race.edges ?? [],
    map.scale,
    undefined,
    race.polygons ?? [],
  );
}
function nodesOf(race: RaceCourseData) {
  const nodes = new Map<string, Node>(
    (race.controls ?? []).map((c) => [c.id, { id: c.id, ...c.mapPosition }]),
  );
  for (const node of race.vertices ?? []) nodes.set(node.id, node);
  return nodes;
}
export function validatePublishedRoute(
  published: PublishedEvent,
  route: CustomRoute,
): void {
  const { race, course } = courseContext(published, route.courseId);
  const nodes = nodesOf(race);
  if (route.legs.length !== course.controls.length - 1)
    throw new Error("Route is incomplete: complete every leg");
  route.legs.forEach((leg, i) => {
    const from = course.controls[i].controlId,
      to = course.controls[i + 1].controlId;
    if (
      leg.fromControlId !== from ||
      leg.toControlId !== to ||
      leg.path.length < 2 ||
      leg.path[0].nodeId !== from ||
      leg.path[leg.path.length - 1].nodeId !== to
    )
      throw new Error(`Leg ${i + 1}: control order or path is incomplete`);
    leg.path.forEach((p, j) => {
      if (!nodes.has(p.nodeId)) throw new Error(`Leg ${i + 1}: missing node`);
      if (j) {
        const previous = leg.path[j - 1].nodeId;
        if (previous === p.nodeId) return; // Repeated nodes represent waiting at a known point.
        const edge = findEdgeByNodes(race.edges ?? [], previous, p.nodeId);
        if (!edge) throw new Error(`Leg ${i + 1}: illegal or one-way edge`);
        const a = nodes.get(previous)!.stair,
          b = nodes.get(p.nodeId)!.stair;
        if (a && b && a.floor !== b.floor) {
          const [lo, hi] = a.floor < b.floor ? [a, b] : [b, a];
          if (
            normalizeStairCode(a.code) !== normalizeStairCode(b.code) ||
            !hasStairPort(lo, "up") ||
            !hasStairPort(hi, "down")
          )
            throw new Error(`Leg ${i + 1}: invalid stair connection`);
        }
      }
    });
  });
}
export interface PublishedGpxOptions {
  startTime: string;
  totalDurationSeconds?: number;
  legDurationsSeconds?: number[];
}
const escapeXml = (text: string) =>
  // XML 1.0 Char production: omit forbidden controls, lone surrogates and U+FFFE/FFFF.
  Array.from(text)
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      );
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export function exportPublishedRouteGpx(
  published: PublishedEvent,
  route: CustomRoute,
  options: PublishedGpxOptions,
): string {
  validatePublishedRoute(published, route);
  const { race, map } = courseContext(published, route.courseId);
  const nodes = nodesOf(race);
  const start = Date.parse(options.startTime);
  if (
    !z.string().datetime({ offset: true }).safeParse(options.startTime)
      .success ||
    !Number.isFinite(start)
  )
    throw new Error("Start time must include a timezone");
  const analyzer = createPublishedRouteAnalyzer(published, route.courseId);
  // Physical distance excludes map-layout transitions; a tiny positive weight gives those transitions strictly increasing times.
  const weights = route.legs.map((leg) =>
    leg.path
      .slice(1)
      .map((p, i) =>
        Math.max(
          0.001,
          analyzer.calculatePathDistance([leg.path[i].nodeId, p.nodeId]),
        ),
      ),
  );
  const totals = weights.map((w) => w.reduce((a, b) => a + b, 0));
  const totalWeight = totals.reduce((a, b) => a + b, 0);
  let durations = options.legDurationsSeconds;
  if (!durations && options.totalDurationSeconds !== undefined) {
    const milliseconds = Math.round(options.totalDurationSeconds * 1000);
    const segments = weights.reduce((sum, leg) => sum + leg.length, 0);
    if (!Number.isFinite(milliseconds) || milliseconds < segments)
      throw new Error(
        "Provide a positive duration with at least one millisecond per segment",
      );
    let accumulatedWeight = 0,
      allocated = 0;
    durations = totals.map((weight, i) => {
      accumulatedWeight += weight;
      const cumulative = Math.round(
        ((milliseconds - segments) * accumulatedWeight) / totalWeight,
      );
      const duration = (weights[i].length + cumulative - allocated) / 1000;
      allocated = cumulative;
      return duration;
    });
  }
  if (!durations) {
    durations = route.legs.map(
      (leg) => leg.path[leg.path.length - 1].legTime ?? NaN,
    );
  }
  if (
    durations.length !== route.legs.length ||
    durations.some((d) => !Number.isFinite(d) || d <= 0)
  )
    throw new Error("Provide positive total or leg durations");
  const points: string[] = [];
  let elapsed = 0;
  let lastTime = -Infinity;
  route.legs.forEach((leg, li) => {
    let weight = 0;
    const explicitTimes =
      options.totalDurationSeconds === undefined &&
      options.legDurationsSeconds === undefined;
    leg.path.forEach((p, pi) => {
      if (pi) weight += weights[li][pi - 1];
      const durationMs = Math.round(durations![li] * 1000);
      const segmentCount = leg.path.length - 1;
      if (!explicitTimes && durationMs < segmentCount)
        throw new Error(
          "Duration is too short for one millisecond per segment",
        );
      const local = explicitTimes
        ? p.legTime
        : (pi +
            Math.round(((durationMs - segmentCount) * weight) / totals[li])) /
          1000;
      if (
        local === undefined ||
        !Number.isFinite(local) ||
        local < 0 ||
        (pi === 0 && local !== 0)
      )
        throw new Error(
          "Every route point needs a valid time from its leg start",
        );
      if (li && pi === 0) return;
      const time = Math.round(start + (elapsed + local) * 1000);
      if (
        time <= lastTime ||
        !Number.isFinite(time) ||
        Math.abs(time) > 8.64e15
      )
        throw new Error(
          "Point times must increase by at least one millisecond",
        );
      lastTime = time;
      const xy = eventPosToMultiPagePixels(nodes.get(p.nodeId)!, map, 1);
      const lat = -xy.y * 0.000009,
        lon = xy.x * 0.000009;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw new Error("Map coordinates exceed synthetic GPX range");
      points.push(
        `<trkpt lat="${lat.toFixed(8)}" lon="${lon.toFixed(8)}"><time>${new Date(time).toISOString()}</time></trkpt>`,
      );
    });
    elapsed += durations![li];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Indoor Orienteering" xmlns="http://www.topografix.com/GPX/1/1"><metadata><desc>Manually reconstructed route. Synthetic map-layout coordinates; estimated timestamps. Not GPS measurements.</desc></metadata><trk><name>${escapeXml(route.name)}</name><trkseg>${points.join("\n")}</trkseg></trk></gpx>`;
}
