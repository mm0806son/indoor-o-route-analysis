import { describe, it, expect, vi } from "vitest";
import {
  createPublishedEvent,
  processImportedJSON,
  serializeEventToJSON,
  type EventData,
} from "@indoor-o-route-analysis/core";
import { prepareEventMaps } from "./prepare-event";
const fixture = (): EventData => ({
  id: "e",
  name: "Race",
  country: "",
  startTime: { date: "2026-10-19" },
  raceCourses: [
    {
      maps: [
        {
          id: "m",
          scale: 1000,
          layout: "horizontal",
          image: { url: "blob:local", width: 100, height: 100 },
          mapPositionTopLeft: { x: 0, y: 0 },
        },
        {
          id: "private",
          scale: 1000,
          layout: "horizontal",
          image: { url: "blob:private" },
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
      ],
      controls: [
        { id: "S", type: "start", mapPosition: { x: 0, y: 0 } },
        { id: "F", type: "finish", mapPosition: { x: 10, y: 10 } },
      ],
      edges: [{ from: "S", to: "F", label: "" }],
    },
  ],
});
describe("prepare local map publication", () => {
  it("embeds current local map without URL and passes actual public schema", async () => {
    const event = fixture();
    const read = vi.fn(async () => undefined);
    const prepared = await prepareEventMaps(
      event,
      ["c"],
      new Uint8Array([1, 2, 3]).buffer,
      read,
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("m");
    expect(event.raceCourses![0].maps![0].image.url).toBe("blob:local");
    const published = createPublishedEvent(prepared, {
      eventId: "race",
      revision: "1",
      courseIds: ["c"],
    });
    expect(published.event.raceCourses![0].maps![0].image.encodedData).toBe(
      "AQID",
    );
    expect(published.event.raceCourses![0].maps![0].image.url).toBeUndefined();
  });
  it("publishes the existing Course Setting saved JSON format", async () => {
    const saved = fixture();
    saved.raceCourses![0].maps![0].image.encodedData = "AQID";
    delete saved.raceCourses![0].maps![0].image.url;
    const imported = await processImportedJSON(
      JSON.parse(serializeEventToJSON(saved)),
    );
    const prepared = await prepareEventMaps(
      imported.event,
      ["c"],
      imported.pdfData ?? null,
      async () => undefined,
    );
    const result = createPublishedEvent(prepared, {
      eventId: "race",
      revision: "1",
      courseIds: ["c"],
    });
    expect(result.event.raceCourses![0].courses![0].mapId).toBe("m");
    expect(result.event.raceCourses![0].maps![0].image.encodedData).toBe(
      "AQID",
    );
  });
  it("never falls back to active PDF for another race", async () => {
    const event = fixture();
    const race = structuredClone(event.raceCourses![0]);
    race.maps![0].id = "other";
    race.courses![0].mapId = "other";
    race.courses![0].id = "other";
    event.raceCourses!.push(race);
    await expect(
      prepareEventMaps(
        event,
        ["other"],
        new Uint8Array([1]).buffer,
        async () => undefined,
      ),
    ).rejects.toThrow(/地图/);
  });
});
