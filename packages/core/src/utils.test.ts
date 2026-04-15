import { describe, it, expect } from "vitest";
import { getCourseControlLabels, getCourseControlLabelMap } from "./utils";
import type { Control } from "./models/control";
import type { CourseControl } from "./models/course";

const controls: Control[] = [
  { id: "S1", type: "start", mapPosition: { x: 0, y: 0 } },
  { id: "31", type: "control", mapPosition: { x: 10, y: 10 } },
  { id: "32", type: "control", mapPosition: { x: 20, y: 20 } },
  { id: "33", type: "control", mapPosition: { x: 30, y: 30 } },
  { id: "F1", type: "finish", mapPosition: { x: 40, y: 40 } },
];

describe("getCourseControlLabels", () => {
  it("should label a simple course S, 1, 2, 3, F", () => {
    const cc: CourseControl[] = [
      { controlId: "S1" },
      { controlId: "31" },
      { controlId: "32" },
      { controlId: "33" },
      { controlId: "F1" },
    ];
    expect(getCourseControlLabels(cc, controls)).toEqual(["S", "1", "2", "3", "F"]);
  });

  it("should handle repeated controls with correct numbering", () => {
    const cc: CourseControl[] = [
      { controlId: "S1" },
      { controlId: "31" },
      { controlId: "32" },
      { controlId: "31" }, // repeated
      { controlId: "F1" },
    ];
    expect(getCourseControlLabels(cc, controls)).toEqual(["S", "1", "2", "3", "F"]);
  });

  it("should use mapText from CourseControl when set", () => {
    const cc: CourseControl[] = [
      { controlId: "S1" },
      { controlId: "31", mapText: "A" },
      { controlId: "32" },
      { controlId: "F1" },
    ];
    expect(getCourseControlLabels(cc, controls)).toEqual(["S", "A", "1", "F"]);
  });

  it("should use mapText from Control when set", () => {
    const controlsWithMapText: Control[] = [
      ...controls.slice(0, 1),
      { id: "31", type: "control", mapPosition: { x: 10, y: 10 }, mapText: "X" },
      ...controls.slice(2),
    ];
    const cc: CourseControl[] = [
      { controlId: "S1" },
      { controlId: "31" },
      { controlId: "32" },
      { controlId: "F1" },
    ];
    expect(getCourseControlLabels(cc, controlsWithMapText)).toEqual(["S", "X", "1", "F"]);
  });

  it("should return empty string for unknown control IDs", () => {
    const cc: CourseControl[] = [
      { controlId: "S1" },
      { controlId: "UNKNOWN" },
      { controlId: "F1" },
    ];
    expect(getCourseControlLabels(cc, controls)).toEqual(["S", "", "F"]);
  });
});

describe("getCourseControlLabelMap", () => {
  it("should combine labels for repeated controls", () => {
    const cc: CourseControl[] = [
      { controlId: "S1" },
      { controlId: "31" },
      { controlId: "32" },
      { controlId: "31" }, // repeated
      { controlId: "F1" },
    ];
    const map = getCourseControlLabelMap(cc, controls);
    expect(map.get("S1")).toBe("S");
    expect(map.get("31")).toBe("1,3");
    expect(map.get("32")).toBe("2");
    expect(map.get("F1")).toBe("F");
  });

  it("should return single labels when no controls are repeated", () => {
    const cc: CourseControl[] = [
      { controlId: "S1" },
      { controlId: "31" },
      { controlId: "F1" },
    ];
    const map = getCourseControlLabelMap(cc, controls);
    expect(map.get("31")).toBe("1");
  });
});
