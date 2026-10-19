import { describe, it, expect, vi } from "vitest";
import type { EventData } from "@indoor-o-route-analysis/core";
import { inspectPublicationMaps } from "./map-metadata";
const pdf = vi.hoisted(() => ({
  numPages: 2,
  getPage: vi.fn(async () => ({
    getViewport: () => ({ width: 720, height: 360 }),
  })),
  destroy: vi.fn(async () => {}),
}));
vi.mock("@/lib/load-pdfjs", () => ({
  loadPdfJs: async () => ({
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve(pdf) }),
  }),
}));
function fixture(encodedData: string): EventData {
  return {
    id: "e",
    name: "E",
    country: "",
    startTime: { date: "2026-10-19" },
    raceCourses: [
      {
        courses: [{ id: "c", name: "C", controls: [], mapId: "m" }],
        maps: [
          {
            id: "m",
            scale: 1000,
            layout: "horizontal",
            mapPositionTopLeft: { x: 0, y: 0 },
            image: { encodedData, width: 1, height: 1 },
          },
        ],
      },
    ],
  };
}
describe("map publication metadata", () => {
  it("derives real PDF page count and millimetre dimensions", async () => {
    const event = fixture("JVBERi0x");
    await inspectPublicationMaps(event, ["c"]);
    expect(event.raceCourses![0].maps![0]).toMatchObject({
      pageCount: 2,
      image: { mediaType: "application/pdf", width: 254, height: 127 },
    });
    expect(pdf.destroy).toHaveBeenCalled();
  });
  it("infers legacy embedded raster MIME without fetching external resources", async () => {
    const event = fixture("iVBORw0KGgo=");
    await inspectPublicationMaps(event, ["c"]);
    expect(event.raceCourses![0].maps![0].image.mediaType).toBe("image/png");
  });
  it("does not inspect unselected maps", async () => {
    await expect(
      inspectPublicationMaps(fixture("invalid"), []),
    ).resolves.toBeUndefined();
  });
});
