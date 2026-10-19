import {
  arrayBufferToBase64,
  type EventData,
} from "@indoor-o-route-analysis/core";

export async function prepareEventMaps(
  event: EventData,
  courseIds: string[],
  currentPdfData: ArrayBuffer | null,
  readMap: (id: string) => Promise<ArrayBuffer | undefined>,
): Promise<EventData> {
  const source = structuredClone(event);
  for (const [raceIndex, race] of (source.raceCourses ?? []).entries()) {
    const mapIds = new Set(
      (race.courses ?? [])
        .filter((course) => courseIds.includes(course.id))
        .map((course) => course.mapId),
    );
    for (const [mapIndex, map] of (race.maps ?? []).entries()) {
      if (
        !mapIds.has(map.id ?? "") &&
        !(race.maps?.length === 1 && mapIds.size > 0)
      )
        continue;
      if (!map.image.encodedData) {
        const bytes =
          (map.id ? await readMap(map.id) : undefined) ??
          (raceIndex === 0 && mapIndex === 0 ? currentPdfData : undefined);
        if (!bytes)
          throw new Error(
            `地图 ${map.id ?? ""} 尚未在本地打开，请先加载地图。`,
          );
        map.image.encodedData = arrayBufferToBase64(bytes);
      }
      delete map.image.url;
    }
  }
  return source;
}
