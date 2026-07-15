import { getEventTransform, getPageIndexForEventPos } from "./models/event";
import type { MapData } from "./models/map";

/**
 * Converts a position in map document coordinates (mm) to SVG pixel coordinates.
 */
export function mapToPixels(
  p: { x: number; y: number },
  transform: { toMap: (p: { x: number; y: number }) => { x: number; y: number } },
  pixelsPerMM: number,
) {
  const pdfMM = transform.toMap(p);
  return { x: pdfMM.x * pixelsPerMM, y: pdfMM.y * pixelsPerMM };
}

/**
 * Converts SVG pixel coordinates to a position in map document coordinates (mm).
 */
export function mapToEvent(
  p: { x: number; y: number },
  transform: { toEvent: (p: { x: number; y: number }) => { x: number; y: number } },
  pixelsPerMM: number,
) {
  const pdfMM = { x: p.x / pixelsPerMM, y: p.y / pixelsPerMM };
  return transform.toEvent(pdfMM);
}

/**
 * Converts SVG pixel coordinates to event-space coordinates, correctly
 * handling multi-page horizontal/vertical layouts with manual per-page transforms.
 *
 * This is the inverse of eventPosToMultiPagePixels:
 *  1. Determines page index from the pixel offset (horizontal: pixelX / pageWidthPx,
 *     vertical: pixelY / pageHeightPx).
 *  2. Subtracts the layout offset to get page-local pixel coords.
 *  3. Applies that page's toEvent transform.
 *
 * Falls back to the single-transform path for automatic mode or non-multi-page layouts.
 */
export function multiPagePixelsToEvent(
  pixelPos: { x: number; y: number },
  mapData: MapData | undefined,
  pixelsPerMM: number,
): { x: number; y: number } {
  if (
    !mapData ||
    mapData.pageTransformMode !== "manual" ||
    (mapData.layout !== "horizontal" && mapData.layout !== "vertical")
  ) {
    const transform = getEventTransform(mapData);
    return mapToEvent(pixelPos, transform, pixelsPerMM);
  }

  const pageCount = mapData.pageCount || 1;
  const pageW = mapData.image.width || 0;
  const pageH = mapData.image.height || 0;

  let pageIndex = 0;
  let pageLocalPx = { ...pixelPos };

  if (mapData.layout === "horizontal") {
    pageIndex = Math.min(Math.floor(pixelPos.x / (pageW * pixelsPerMM)), pageCount - 1);
    pageLocalPx = { x: pixelPos.x - pageIndex * pageW * pixelsPerMM, y: pixelPos.y };
  } else {
    pageIndex = Math.min(Math.floor(pixelPos.y / (pageH * pixelsPerMM)), pageCount - 1);
    pageLocalPx = { x: pixelPos.x, y: pixelPos.y - pageIndex * pageH * pixelsPerMM };
  }

  const pageTransform = getEventTransform(mapData, pageIndex);
  return mapToEvent(pageLocalPx, pageTransform, pixelsPerMM);
}

/**
 * Converts an event-coordinate position to SVG pixel coordinates, correctly
 * handling multi-page horizontal/vertical layouts with manual per-page transforms.
 *
 * For each control it:
 *  1. Finds which page the control belongs to (getPageIndexForEventPos).
 *  2. Applies that page's transform to get page-local pixel coords.
 *  3. Adds the layout offset (horizontal: +pageIndex * pageWidthPx,
 *     vertical: +pageIndex * pageHeightPx).
 *
 * Falls back to the single-transform path for automatic mode or non-multi-page layouts.
 */
export function eventPosToMultiPagePixels(
  eventPos: { x: number; y: number },
  mapData: MapData | undefined,
  pixelsPerMM: number,
): { x: number; y: number } {
  if (
    !mapData ||
    mapData.pageTransformMode !== "manual" ||
    (mapData.layout !== "horizontal" && mapData.layout !== "vertical")
  ) {
    const transform = getEventTransform(mapData);
    return mapToPixels(eventPos, transform, pixelsPerMM);
  }

  const pageW = mapData.image.width || 0;
  const pageH = mapData.image.height || 0;

  const pageIndex = getPageIndexForEventPos(eventPos, mapData);
  const pageTransform = getEventTransform(mapData, pageIndex);
  const pageLocalPx = mapToPixels(eventPos, pageTransform, pixelsPerMM);

  if (mapData.layout === "horizontal") {
    return { x: pageLocalPx.x + pageIndex * pageW * pixelsPerMM, y: pageLocalPx.y };
  } else {
    return { x: pageLocalPx.x, y: pageLocalPx.y + pageIndex * pageH * pixelsPerMM };
  }
}
