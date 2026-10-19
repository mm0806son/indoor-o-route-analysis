import { describe, it, expect } from "vitest";
import { createBundle, parseBundle } from "./publication-bundle";

describe("publication bundle boundary", () => {
  it("exports a paused empty site without private or archived events", () => {
    expect(createBundle([], null)).toEqual({
      schemaVersion: 1,
      currentEventId: null,
      events: [],
    });
  });
  it("rejects unknown current events", () => {
    expect(() => createBundle([], "missing")).toThrow();
  });
  it("rejects malformed and unversioned imports", () => {
    expect(() => parseBundle({ events: [] })).toThrow();
    expect(() =>
      parseBundle({ schemaVersion: 1, currentEventId: null, events: [{}] }),
    ).toThrow();
  });
  it("never propagates extraneous private fields from imported bundles", () => {
    expect(
      parseBundle({
        schemaVersion: 1,
        currentEventId: null,
        events: [],
        privateRoutes: ["secret"],
      }),
    ).not.toHaveProperty("privateRoutes");
  });
});
