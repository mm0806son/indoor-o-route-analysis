import {
  createPublicationManifest,
  parsePublishedEvent,
  type PublishedEvent,
} from "@indoor-o-route-analysis/core";

/** Transport file: only currently public packages; archives remain on the organizer's device. */
export interface PublicationBundle {
  schemaVersion: 1;
  currentEventId: string | null;
  events: PublishedEvent[];
}

export function createBundle(
  events: PublishedEvent[],
  currentEventId: string | null,
): PublicationBundle {
  const clean = events.map((event) => parsePublishedEvent(event));
  createPublicationManifest(clean, currentEventId);
  for (const event of clean) {
    for (const race of event.event.raceCourses ?? []) {
      for (const map of race.maps ?? []) {
        if (!map.image.encodedData)
          throw new Error("发布包必须嵌入所有地图，请先在编辑器中打开地图。");
      }
    }
  }
  return { schemaVersion: 1, currentEventId, events: clean };
}

export function parseBundle(value: unknown): PublicationBundle {
  if (!value || typeof value !== "object") throw new Error("无效发布包");
  const data = value as Record<string, unknown>;
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.events) ||
    (data.currentEventId !== null && typeof data.currentEventId !== "string")
  )
    throw new Error("无效发布包格式或版本");
  return createBundle(
    data.events.map(parsePublishedEvent),
    data.currentEventId,
  );
}
