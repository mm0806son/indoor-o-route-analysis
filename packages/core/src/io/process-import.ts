import type { EventData } from "../models/event";
import { base64ToArrayBuffer } from "../utils";
import { parseEventFromJSON } from "./json-io";
import { getMapFile } from "../indexeddb";

/**
 * Parse imported JSON data and extract PDF data if present.
 * Returns the parsed event and optional PDF ArrayBuffer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processImportedJSON(importedData: any): Promise<{ event: EventData; pdfData?: ArrayBuffer }> {
  let pdfData: ArrayBuffer | undefined;

  // Extract encoded map data
  if (importedData.raceCourses?.[0]?.maps?.[0]?.image?.encodedData) {
    try {
      const mapData = importedData.raceCourses[0].maps[0];
      pdfData = base64ToArrayBuffer(mapData.image.encodedData);
      mapData.saveEncoded = true;
    } catch (e) {
      console.error("Failed to decode map data", e);
    }
  }

  // Parse and migrate
  const newEvent = parseEventFromJSON(JSON.stringify(importedData));

  // Try to load existing map data if not embedded
  if (!pdfData) {
    const mapId = newEvent.raceCourses?.[0]?.maps?.[0]?.id;
    if (mapId) {
      try {
        const existing = await getMapFile(mapId);
        if (existing) {
          pdfData = existing;
          if (newEvent.raceCourses && newEvent.raceCourses[0].maps) {
            newEvent.raceCourses[0].maps[0].id = crypto.randomUUID();
          }
        }
      } catch (e) {
        console.warn("Failed to clone map", e);
      }
    }
  }

  if (!newEvent.id) {
    newEvent.id = crypto.randomUUID();
  }

  return { event: newEvent, pdfData };
}
