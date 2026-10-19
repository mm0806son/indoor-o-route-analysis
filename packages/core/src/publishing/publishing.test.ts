import { describe, expect, it } from "vitest";
import type { EventData } from "../models/event";
import type { CustomRoute } from "../models/route";
import {
  createPublicationManifest,
  createPublishedEvent,
  exportPublishedRouteGpx,
  parsePublicationManifest,
  parsePublishedEvent,
  validatePublishedRoute,
} from "./index";

const route: CustomRoute = {
  id: "r",
  name: "A & <B>",
  courseId: "c",
  legs: [
    {
      fromControlId: "S",
      toControlId: "F",
      path: [{ nodeId: "S" }, { nodeId: "n" }, { nodeId: "F" }],
    },
  ],
};
function fixture(): EventData {
  return {
    id: "e",
    name: "Test",
    country: "",
    startTime: { date: "2026-10-19" },
    raceCourses: [
      {
        maps: [
          {
            id: "m",
            scale: 1000,
            layout: "horizontal",
            image: {
              encodedData: "data:image/png;base64,AAAA",
              width: 100,
              height: 100,
            },
            mapPositionTopLeft: { x: 0, y: 0 },
            mapPositionBottomRight: { x: 100, y: 100 },
          },
          {
            id: "private",
            scale: 1000,
            layout: "pages",
            image: { encodedData: "secret" },
            mapPositionTopLeft: { x: 0, y: 0 },
          },
        ],
        courses: [
          {
            id: "c",
            name: "C",
            mapId: "m",
            controls: [{ controlId: "S" }, { controlId: "F" }],
          },
          { id: "private", name: "Private", mapId: "private", controls: [] },
        ],
        controls: [
          { id: "S", type: "start", mapPosition: { x: 10, y: 10 } },
          { id: "F", type: "finish", mapPosition: { x: 30, y: 30 } },
        ],
        vertices: [{ id: "n", x: 20, y: 20 }],
        edges: [
          { from: "S", to: "n", label: "", oneWay: true },
          { from: "n", to: "F", label: "" },
        ],
        customRoutes: [route, { ...route, id: "private" }],
      },
    ],
  };
}
const publish = () =>
  createPublishedEvent(fixture(), {
    eventId: "race",
    revision: "v1",
    courseIds: ["c"],
  });
describe("publication contract", () => {
  it("exports explicit selection, never private routes or unselected maps/courses", () => {
    const source = fixture();
    const result = createPublishedEvent(source, {
      eventId: "race",
      revision: "v1",
      courseIds: ["c"],
    });
    expect(result.event.raceCourses![0].customRoutes).toBeUndefined();
    expect(result.event.raceCourses![0].maps).toHaveLength(1);
    expect(result.event.raceCourses![0].courses).toHaveLength(1);
    expect(result).not.toHaveProperty("recommendations");
    expect(
      parsePublishedEvent({ ...result, recommendations: [route] }),
    ).not.toHaveProperty("recommendations");
    expect(source.raceCourses![0].customRoutes).toHaveLength(2);
    result.event.name = "changed";
    expect(source.name).toBe("Test");
  });
  it("round trips and rejects broken references", () => {
    expect(
      parsePublishedEvent(JSON.parse(JSON.stringify(publish()))).eventId,
    ).toBe("race");
    const p = publish();
    p.event.raceCourses![0].edges![0].to = "missing";
    expect(() => parsePublishedEvent(p)).toThrow();
  });
  it("supports pause and rejects non-public current IDs", () => {
    expect(
      createPublicationManifest([publish()], null).currentEventId,
    ).toBeNull();
    expect(() => createPublicationManifest([publish()], "absent")).toThrow();
  });
  it.each([
    "https://evil/a.json",
    "//evil/a.json",
    "../a.json",
    "events/%2e%2e/a.json",
    "events/a\\b.json",
  ])("rejects unsafe resource path %s", (path) => {
    expect(() =>
      parsePublicationManifest({
        schemaVersion: 1,
        currentEventId: "race",
        events: [{ eventId: "race", revision: "v1", path }],
      }),
    ).toThrow();
  });
  it("rejects external map fetches", () => {
    const p = publish();
    p.event.raceCourses![0].maps![0].image = { url: "https://remote/map.png" };
    expect(() => parsePublishedEvent(p)).toThrow();
  });
});
describe("route and synthetic GPX", () => {
  it("rejects incomplete and illegal routes", () => {
    expect(() =>
      validatePublishedRoute(publish(), { ...route, legs: [] }),
    ).toThrow();
    const bad = structuredClone(route);
    bad.legs[0].path = [{ nodeId: "S" }, { nodeId: "F" }];
    expect(() => validatePublishedRoute(publish(), bad)).toThrow();
  });
  it("rejects reverse one-way traversal", () => {
    const p = publish();
    p.event.raceCourses![0].edges![0] = {
      from: "n",
      to: "S",
      label: "",
      oneWay: true,
    };
    expect(() => validatePublishedRoute(p, route)).toThrow();
  });
  it("exports escaped XML and UTC times across midnight with synthetic shape", () => {
    const gpx = exportPublishedRouteGpx(publish(), route, {
      startTime: "2026-10-19T23:59:50+02:00",
      totalDurationSeconds: 20,
    });
    expect(gpx).toContain("A &amp; &lt;B&gt;");
    expect(gpx).toContain("2026-10-19T21:59:50.000Z");
    expect(gpx).toContain("2026-10-19T22:00:10.000Z");
    expect(gpx).toContain('lat="-0.00009000" lon="0.00009000"');
    expect(gpx).not.toContain("<ele>");
  });
  it("rejects invalid times and missing duration", () => {
    expect(() =>
      exportPublishedRouteGpx(publish(), route, {
        startTime: "2026-10-19T12:00:00",
        totalDurationSeconds: 20,
      }),
    ).toThrow();
    expect(() =>
      exportPublishedRouteGpx(publish(), route, {
        startTime: "2026-10-19T12:00:00Z",
        totalDurationSeconds: 0,
      }),
    ).toThrow();
    expect(() =>
      exportPublishedRouteGpx(publish(), route, {
        startTime: "2026-10-19T12:00:00Z",
      }),
    ).toThrow();
  });
  it("preserves manual multi-page layout and ignores geographic calibration", () => {
    const p = publish();
    const m = p.event.raceCourses![0].maps![0];
    m.latitude = 80;
    m.longitude = 120;
    m.pageCount = 2;
    m.pageTransformMode = "manual";
    m.pageTransforms = [
      { topLeft: { x: 0, y: 0 }, bottomRight: { x: 25, y: 100 } },
      { topLeft: { x: 25, y: 0 }, bottomRight: { x: 50, y: 100 } },
    ];
    const gpx = exportPublishedRouteGpx(p, route, {
      startTime: "2026-10-19T12:00:00Z",
      legDurationsSeconds: [10],
    });
    expect(gpx).toContain('lon="0.00108000"');
  });
});

describe("timing and malformed data regressions", () => {
  it("supports explicit point times with a pause at a node", () => {
    const r = structuredClone(route);
    r.legs[0].path = [
      { nodeId: "S", legTime: 0 },
      { nodeId: "n", legTime: 5 },
      { nodeId: "n", legTime: 15 },
      { nodeId: "F", legTime: 20 },
    ];
    const xml = exportPublishedRouteGpx(publish(), r, {
      startTime: "2026-10-19T00:00:00Z",
    });
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelectorAll("trkpt")).toHaveLength(4);
    expect(doc.querySelector("name")?.textContent).toBe(route.name);
  });
  it("rejects decreasing explicit point times", () => {
    const r = structuredClone(route);
    r.legs[0].path[0].legTime = 0;
    r.legs[0].path[1].legTime = 30;
    r.legs[0].path[2].legTime = 20;
    expect(() =>
      exportPublishedRouteGpx(publish(), r, {
        startTime: "2026-10-19T00:00:00Z",
      }),
    ).toThrow();
  });
  it("rejects contradictory annotated stair connections", () => {
    const p = publish();
    p.event.raceCourses![0].vertices!.push({
      id: "stairs",
      x: 25,
      y: 25,
      stair: { code: "B", floor: 2, port: "down" },
    });
    p.event.raceCourses![0].vertices![0].stair = {
      code: "A",
      floor: 1,
      port: "up",
    };
    p.event.raceCourses![0].edges!.push(
      { from: "n", to: "stairs", label: "A", ignoreLength: true },
      { from: "stairs", to: "F", label: "" },
    );
    const r = structuredClone(route);
    r.legs[0].path.splice(2, 0, { nodeId: "stairs" });
    expect(() => validatePublishedRoute(p, r)).toThrow(/stair/i);
  });
  it("validates selected course connectivity before publication", () => {
    const e = fixture();
    e.raceCourses![0].edges = [];
    expect(() =>
      createPublishedEvent(e, {
        eventId: "race",
        revision: "v1",
        courseIds: ["c"],
      }),
    ).toThrow(/connect/i);
  });
});

it("allocates increasing times even across zero-distance layout transitions", () => {
  const p = publish();
  p.event.raceCourses![0].edges![0].ignoreLength = true;
  p.event.raceCourses![0].vertices![0].x = 100000;
  const xml = exportPublishedRouteGpx(p, route, {
    startTime: "2026-10-19T00:00:00Z",
    totalDurationSeconds: 10,
  });
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const times = [...doc.querySelectorAll("trkpt time")].map((p) =>
    Date.parse(p.textContent!),
  );
  expect(times[1]).toBeGreaterThan(times[0]);
  expect(times[2] - times[0]).toBe(10000);
});

it.each([
  "data:text/html;base64,AAAA",
  "data:image/svg+xml;base64,AAAA",
])("rejects active or unknown embedded media %s", (encodedData) => {
  const p = publish();
  p.event.raceCourses![0].maps![0].image.encodedData = encodedData;
  expect(() => parsePublishedEvent(p)).toThrow();
});

it("rejects a node/control coordinate conflict", () => {
  const p = publish();
  p.event.raceCourses![0].vertices!.push({ id: "S", x: 999, y: 10 });
  expect(() => parsePublishedEvent(p)).toThrow(/coordinates conflict/);
});
it("requires usable map dimensions", () => {
  const p = publish();
  p.event.raceCourses![0].maps![0].image.width = undefined;
  expect(() => parsePublishedEvent(p)).toThrow();
});
it("publishes and exports a real multi-floor competition", async () => {
  const { readFileSync } = await import("node:fs");
  const saved = JSON.parse(
    readFileSync(
      "../../apps/web/public/examples/2026-02-08-Stockholm-Indoor-Cup-E2.json",
      "utf8",
    ),
  ) as EventData;
  const { processImportedJSON } = await import("../io/process-import");
  const { event } = await processImportedJSON(saved);
  const course = event.raceCourses![0].courses![0];
  const p = createPublishedEvent(event, {
    eventId: "sic-2026",
    revision: "r1",
    courseIds: [course.id],
  });
  const { createPublishedRouteAnalyzer } = await import("./index");
  const analyzer = createPublishedRouteAnalyzer(p, course.id);
  const r: CustomRoute = {
    id: "sample",
    name: "Real competition",
    courseId: course.id,
    legs: course.controls.slice(1).map((control, i) => ({
      fromControlId: course.controls[i].controlId,
      toControlId: control.controlId,
      path: analyzer
        .dijkstra(course.controls[i].controlId, control.controlId)!
        .path.map((nodeId) => ({ nodeId })),
    })),
  };
  const xml = exportPublishedRouteGpx(p, r, {
    startTime: "2026-10-19T00:00:00Z",
    totalDurationSeconds: 1800,
  });
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  const points = [...doc.querySelectorAll("trkpt")];
  expect(points.length).toBeGreaterThan(20);
  expect(
    Date.parse(points.at(-1)!.querySelector("time")!.textContent!) -
      Date.parse(points[0].querySelector("time")!.textContent!),
  ).toBe(1800000);
});

describe("publication geometry consistency", () => {
  it("rejects degenerate automatic calibration instead of silently switching to identity", () => {
    const p = publish();
    const m = p.event.raceCourses![0].maps![0];
    m.mapPositionBottomRight = { x: 0, y: 100 };
    expect(() => parsePublishedEvent(p)).toThrow(/calibration/);
  });
  it("rejects manual missing and zero-area per-page transforms", () => {
    const p = publish();
    const m = p.event.raceCourses![0].maps![0];
    m.pageCount = 2;
    m.pageTransformMode = "manual";
    m.pageTransforms = [
      { topLeft: { x: 0, y: 0 }, bottomRight: { x: 100, y: 100 } },
    ];
    expect(() => parsePublishedEvent(p)).toThrow(/transform/);
    m.pageTransforms.push({
      topLeft: { x: 200, y: 0 },
      bottomRight: { x: 200, y: 100 },
    });
    expect(() => parsePublishedEvent(p)).toThrow(/calibration/);
  });
  it("rejects overlapping manual page bounds that map a node to two pages", () => {
    const p = publish();
    const m = p.event.raceCourses![0].maps![0];
    m.pageCount = 2;
    m.pageTransformMode = "manual";
    m.pageTransforms = [
      { topLeft: { x: 0, y: 0 }, bottomRight: { x: 100, y: 100 } },
      { topLeft: { x: 50, y: 0 }, bottomRight: { x: 150, y: 100 } },
    ];
    expect(() => parsePublishedEvent(p)).toThrow(/overlap/);
  });
  it("rejects parallel graph edges with inconsistent routing distance", () => {
    const p = publish();
    p.event.raceCourses![0].edges!.push({
      from: "n",
      to: "F",
      label: "",
      ignoreLength: true,
    });
    expect(() => parsePublishedEvent(p)).toThrow(/Duplicate.*edge/);
  });
  it("rejects duplicate course IDs across races even when maps and nodes differ", () => {
    const p = publish();
    p.event.raceCourses!.push(structuredClone(p.event.raceCourses![0]));
    expect(() => parsePublishedEvent(p)).toThrow(/Duplicate course/);
  });
});

it("rejects impossible calendar dates instead of silently changing the start day", () => {
  expect(() =>
    exportPublishedRouteGpx(publish(), route, {
      startTime: "2026-02-30T00:00:00Z",
      totalDurationSeconds: 20,
    }),
  ).toThrow(/time/i);
});
it("removes XML-forbidden Unicode from route names while preserving emoji", () => {
  const r = { ...route, name: "A\uFFFE\uFFFF\uD800🏃" };
  const xml = exportPublishedRouteGpx(publish(), r, {
    startTime: "2026-10-19T00:00:00Z",
    totalDurationSeconds: 20,
  });
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  expect(doc.querySelector("name")?.textContent).toBe("A🏃");
});
