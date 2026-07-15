import { describe, it, expect } from "vitest";
import {
  mapToPixels,
  mapToEvent,
  multiPagePixelsToEvent,
  eventPosToMultiPagePixels,
} from "./map-coordinates";
import type { MapData } from "./models/map";

describe("mapToPixels / mapToEvent", () => {
  it("round-trips through a custom transform", () => {
    const transform = {
      toMap: (p: { x: number; y: number }) => ({ x: p.x - 5, y: p.y - 5 }),
      toEvent: (p: { x: number; y: number }) => ({ x: p.x + 5, y: p.y + 5 }),
    };
    const pixelsPerMM = 3;
    const eventPos = { x: 15, y: 25 };

    const pixels = mapToPixels(eventPos, transform, pixelsPerMM);
    expect(pixels).toEqual({ x: (15 - 5) * 3, y: (25 - 5) * 3 });

    const roundTripped = mapToEvent(pixels, transform, pixelsPerMM);
    expect(roundTripped.x).toBeCloseTo(eventPos.x);
    expect(roundTripped.y).toBeCloseTo(eventPos.y);
  });
});

describe("eventPosToMultiPagePixels / multiPagePixelsToEvent", () => {
  it("round-trips with no map data (identity transform)", () => {
    const pixelsPerMM = 2;
    const eventPos = { x: 10, y: 20 };

    const pixels = eventPosToMultiPagePixels(eventPos, undefined, pixelsPerMM);
    expect(pixels).toEqual({ x: 20, y: 40 });

    const back = multiPagePixelsToEvent(pixels, undefined, pixelsPerMM);
    expect(back.x).toBeCloseTo(eventPos.x);
    expect(back.y).toBeCloseTo(eventPos.y);
  });

  it("falls back to the single-transform path for automatic mode", () => {
    const mapData: MapData = {
      scale: 1000,
      image: { width: 100, height: 50 },
      mapPositionTopLeft: { x: 0, y: 0 },
      mapPositionBottomRight: { x: 200, y: 100 },
      layout: "pages",
      pageTransformMode: "automatic",
    };
    const pixelsPerMM = 4;
    const eventPos = { x: 50, y: 25 };

    const pixels = eventPosToMultiPagePixels(eventPos, mapData, pixelsPerMM);
    const back = multiPagePixelsToEvent(pixels, mapData, pixelsPerMM);
    expect(back.x).toBeCloseTo(eventPos.x);
    expect(back.y).toBeCloseTo(eventPos.y);
  });

  describe("manual per-page transforms, horizontal layout", () => {
    const mapData: MapData = {
      scale: 1000,
      image: { width: 100, height: 200 },
      mapPositionTopLeft: { x: 0, y: 0 },
      layout: "horizontal",
      pageCount: 2,
      pageTransformMode: "manual",
      pageTransforms: [
        { topLeft: { x: 0, y: 0 }, bottomRight: { x: 100, y: 200 } },
        { topLeft: { x: 1000, y: 0 }, bottomRight: { x: 1100, y: 200 } },
      ],
    };
    const pixelsPerMM = 2;

    it("maps a point on page 0 to pixels in the first page's slot", () => {
      const pixels = eventPosToMultiPagePixels({ x: 50, y: 100 }, mapData, pixelsPerMM);
      expect(pixels).toEqual({ x: 100, y: 200 });
    });

    it("maps a point on page 1 to pixels offset by one page width", () => {
      const pixels = eventPosToMultiPagePixels({ x: 1050, y: 100 }, mapData, pixelsPerMM);
      expect(pixels).toEqual({ x: 300, y: 200 });
    });

    it("round-trips pixels on both pages back to the original event position", () => {
      for (const eventPos of [
        { x: 10, y: 20 },
        { x: 90, y: 180 },
        { x: 1010, y: 20 },
        { x: 1090, y: 180 },
      ]) {
        const pixels = eventPosToMultiPagePixels(eventPos, mapData, pixelsPerMM);
        const back = multiPagePixelsToEvent(pixels, mapData, pixelsPerMM);
        expect(back.x).toBeCloseTo(eventPos.x);
        expect(back.y).toBeCloseTo(eventPos.y);
      }
    });
  });

  describe("manual per-page transforms, vertical layout", () => {
    const mapData: MapData = {
      scale: 1000,
      image: { width: 100, height: 200 },
      mapPositionTopLeft: { x: 0, y: 0 },
      layout: "vertical",
      pageCount: 2,
      pageTransformMode: "manual",
      pageTransforms: [
        { topLeft: { x: 0, y: 0 }, bottomRight: { x: 100, y: 200 } },
        { topLeft: { x: 0, y: 1000 }, bottomRight: { x: 100, y: 1200 } },
      ],
    };
    const pixelsPerMM = 2;

    it("round-trips pixels on both pages back to the original event position", () => {
      for (const eventPos of [
        { x: 10, y: 20 },
        { x: 90, y: 180 },
        { x: 10, y: 1020 },
        { x: 90, y: 1180 },
      ]) {
        const pixels = eventPosToMultiPagePixels(eventPos, mapData, pixelsPerMM);
        const back = multiPagePixelsToEvent(pixels, mapData, pixelsPerMM);
        expect(back.x).toBeCloseTo(eventPos.x);
        expect(back.y).toBeCloseTo(eventPos.y);
      }
    });

    it("keeps page 1 pixels below page 0's vertical slot", () => {
      const page0Pixels = eventPosToMultiPagePixels({ x: 50, y: 100 }, mapData, pixelsPerMM);
      const page1Pixels = eventPosToMultiPagePixels({ x: 50, y: 1100 }, mapData, pixelsPerMM);
      expect(page1Pixels.y).toBeGreaterThan(page0Pixels.y);
    });
  });
});
