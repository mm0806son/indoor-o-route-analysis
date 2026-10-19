import { describe, it, expect } from "vitest";
import { exportEventToIOFXML, parseEventFromIOFXML } from "./io/xml-io";
import { readFileSync } from "node:fs";
import {
  connectStairNodes,
  convertLegacyStairs,
  diagnoseStairs,
  matchStairNodes,
  normalizeStairCode,
  stairNodeLabel,
  validateFloorOrder,
} from "./stairs";
import type { Node, RaceCourseData, StairNode } from "./models";
import { serializeEventToJSON, parseEventFromJSON } from "./io/json-io";
const node = (
  id: string,
  floor: number,
  port: StairNode["port"],
  code = "A",
): Node => ({ id, x: 0, y: 0, stair: { code, floor, port } });
const graph = (vertices: Node[]): RaceCourseData => ({
  vertices,
  edges: [],
  stairFloorOrder: [-1, 1, 2],
});
describe("stair configuration", () => {
  it("normalizes identity, preserves numeric suffix and derives both directional codes", () => {
    expect(normalizeStairCode(" a1 ")).toBe("A1");
    expect(stairNodeLabel({ code: "A1", floor: 1, port: "both" })).toBe(
      "A1/a1",
    );
    expect(() => normalizeStairCode("123")).toThrow();
    expect(() => validateFloorOrder([1, 1])).toThrow();
  });
  it("connects a spiral node to both physical adjacent floors", () => {
    const race = matchStairNodes(
      graph([node("a", -1, "up"), node("b", 1, "both"), node("c", 2, "down")]),
    ).race;
    expect(race.edges).toEqual([
      {
        from: "a",
        to: "b",
        label: "A",
        reverseLabel: "a",
        ignoreLength: true,
        oneWay: false,
      },
      {
        from: "b",
        to: "c",
        label: "A",
        reverseLabel: "a",
        ignoreLength: true,
        oneWay: false,
      },
    ]);
    expect(diagnoseStairs(race)).toEqual([]);
    expect(matchStairNodes(race).race.edges).toHaveLength(2);
  });
  it("does not cross missing floors or connect ambiguous endpoints", () => {
    expect(
      matchStairNodes(graph([node("a", -1, "up"), node("c", 2, "down")])).race
        .edges,
    ).toHaveLength(0);
    expect(
      matchStairNodes(
        graph([
          node("a", -1, "up"),
          node("b", 1, "down"),
          node("c", 1, "down"),
        ]),
      ).race.edges,
    ).toHaveLength(0);
  });
  it("keeps separate same-floor stair endpoints connected only by existing corridors", () => {
    const race = matchStairNodes(
      graph([
        node("a", -1, "up"),
        node("b", 1, "down"),
        node("c", 1, "up"),
        node("d", 2, "down"),
      ]),
    ).race;
    expect(race.edges?.map((e) => [e.from, e.to])).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("protects existing ordinary and one-way edges in either orientation", () => {
    const race = {
      ...graph([node("a", -1, "up"), node("b", 1, "down")]),
      edges: [{ from: "b", to: "a", label: "", oneWay: true }],
    };
    expect(matchStairNodes(race).race.edges).toEqual(race.edges);
    expect(() => connectStairNodes(race, "a", "b")).toThrow("already");
  });
  it("requires explicit cross-floor consent; does not infer connections on diagnosis or serialization", () => {
    const race = graph([node("a", -1, "up"), node("c", 2, "down")]);
    expect(() => connectStairNodes(race, "a", "c")).toThrow("intermediate");
    expect(connectStairNodes(race, "a", "c", true).edges).toHaveLength(1);
    diagnoseStairs(race);
    expect(race.edges).toEqual([]);
    const event = {
      id: "test",
      name: "Stairs",
      startTime: { date: "2026-10-17" },
      country: "" as const,
      raceCourses: [race],
    };
    expect(
      parseEventFromJSON(serializeEventToJSON(event)).raceCourses?.[0],
    ).toEqual(race);
  });
  it("converts reversed legacy edges without rewriting labels or direction", () => {
    const a = node("a", -1, "up", "A1"),
      b = node("b", 1, "down", "A1");
    const race = {
      ...graph([a, b]),
      edges: [
        {
          from: "b",
          to: "a",
          label: "a1",
          reverseLabel: "A1",
          ignoreLength: true,
        },
      ],
    };
    const result = convertLegacyStairs(race);
    expect(result.messages).toEqual([]);
    expect(result.race.edges).toBe(race.edges);
    const wrong = {
      ...race,
      edges: [{ ...race.edges[0], label: "A1", reverseLabel: "a1" }],
    };
    expect(convertLegacyStairs(wrong).messages.length).toBeGreaterThan(0);
  });
  it("reports floor reorder conflicts without modifying edges", () => {
    const race = matchStairNodes(
      graph([node("a", -1, "up"), node("b", 1, "down")]),
    ).race;
    const reordered = { ...race, stairFloorOrder: [1, -1, 2] };
    expect(diagnoseStairs(reordered).length).toBeGreaterThan(0);
    expect(reordered.edges).toBe(race.edges);
  });
  it("converts the real Wangfujing graph while preserving every edge", () => {
    const race = JSON.parse(
      readFileSync("src/__fixtures__/wangfujing-stairs.json", "utf8"),
    ) as RaceCourseData;
    race.stairFloorOrder = [-2, -1, 1, 2, 3, 4, 5];
    const original = JSON.stringify(race.edges);
    const converted = convertLegacyStairs(race);
    expect(race.vertices).toHaveLength(591);
    expect(race.edges).toHaveLength(753);
    expect(JSON.stringify(converted.race.edges)).toBe(original);
    expect(
      converted.race.vertices?.filter((n) => n.stair).length,
    ).toBeGreaterThan(100);
    expect(converted.race.vertices?.some((n) => n.stair?.code === "A1")).toBe(
      true,
    );
    expect(convertLegacyStairs(converted.race).race.vertices).toEqual(
      converted.race.vertices,
    );
  });
  it("reports ordinary edges between annotated cross-floor endpoints", () => {
    const race = graph([node("a", -1, "up"), node("b", 1, "down")]);
    race.edges = [
      {
        from: "a",
        to: "b",
        label: "A",
        reverseLabel: "a",
        ignoreLength: false,
      },
    ];
    expect(
      diagnoseStairs(race).some((m) => m.includes("must ignore length")),
    ).toBe(true);
  });
  it("imports real IOF courses and preserves legacy routing through XML export", () => {
    const courses = parseEventFromIOFXML(
      readFileSync("src/__fixtures__/wangfujing-courses.xml", "utf8"),
    );
    expect(courses.raceCourses?.[0].courses?.length).toBeGreaterThan(0);
    const race = matchStairNodes(
      graph([node("a", -1, "up"), node("b", 1, "down")]),
    ).race;
    const event = {
      id: "test",
      name: "Stairs",
      startTime: { date: "2026-10-17" },
      country: "" as const,
      raceCourses: [{ ...courses.raceCourses?.[0], ...race }],
    };
    const parsed = parseEventFromIOFXML(exportEventToIOFXML(event));
    expect(parsed.raceCourses?.[0].edges).toEqual(race.edges);
    expect(parsed.raceCourses?.[0].courses?.length).toBe(
      courses.raceCourses?.[0].courses?.length,
    );
  });
});
