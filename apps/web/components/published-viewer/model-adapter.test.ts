import { describe, expect, it } from "vitest";
import { createPublishedScene } from "./model-adapter";
import { publishedA } from "../../e2e/fixtures/publication";
describe("published 3D adapter", () => {
  it("selects the active map and preserves floor alignment without modifying official data", () => {
    const event = structuredClone(publishedA.event);
    const race = event.raceCourses![0];
    race.polygons = [
      {
        id: "floor",
        points: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 120 },
          { x: 0, y: 120 },
        ],
        level: 2,
        origin: { x: 10, y: 20 },
        elevation: 6,
      },
    ];
    const map = race.maps![0];
    race.maps = [{ ...map, id: "unselected" }, map];
    const result = createPublishedScene(event, race, map, [
      { path: ["S", "A", "31"], color: "#c084fc", progress: 1 },
    ]);
    expect(result.event.raceCourses![0].maps![0].id).toBe(map.id);
    expect(result.event.raceCourses![0].polygons![0].origin).toEqual({
      x: 10,
      y: 20,
    });
    expect(result.segments[0].points[0].level).toBe(2);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].points).toHaveLength(3);
    expect(race.maps).toHaveLength(2);
  });
  it("preserves stair transitions and both selected and personal route colors", () => {
    const event = structuredClone(publishedA.event),
      race = event.raceCourses![0],
      map = race.maps![0];
    race.edges![0].ignoreLength = true;
    const result = createPublishedScene(event, race, map, [
      { path: ["S", "A"], color: "red", progress: 1 },
      { path: ["S", "B"], color: "green", progress: 1 },
    ]);
    expect(result.segments.map((segment) => segment.color)).toEqual([
      "red",
      "green",
    ]);
    expect(result.segments[0].isMapSegmentTransition).toBe(true);
  });
});
