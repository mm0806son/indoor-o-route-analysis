import {
  getDocumentDimensions,
  type MapData,
  type PageTransform,
} from "../models/map";

/** Reject calibrations that the permissive editor transform would silently treat as identity. */
export function validatePublishedMapGeometry(map: MapData): void {
  const dimensions = getDocumentDimensions(map);
  const global = {
    topLeft: map.mapPositionTopLeft,
    bottomRight: map.mapPositionBottomRight ?? dimensionsAsPoint(dimensions),
  };
  const validateBounds = (bounds: PageTransform) => {
    if (
      Math.abs(bounds.bottomRight.x - bounds.topLeft.x) < 1e-6 ||
      Math.abs(bounds.bottomRight.y - bounds.topLeft.y) < 1e-6
    )
      throw new Error("Map calibration must have non-zero width and height");
  };
  if (map.pageTransformMode !== "manual") {
    validateBounds(global);
    return;
  }
  const count = map.layout === "pages" ? 1 : (map.pageCount ?? 1);
  if (count > 1 && (map.pageTransforms?.length ?? 0) < count)
    throw new Error("Each manual map page needs a transform");
  const bounds = Array.from(
    { length: count },
    (_, i) => map.pageTransforms?.[i] ?? global,
  );
  bounds.forEach(validateBounds);
  for (let i = 0; i < bounds.length; i++)
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i],
        b = bounds[j];
      const overlapX =
        Math.min(
          Math.max(a.topLeft.x, a.bottomRight.x),
          Math.max(b.topLeft.x, b.bottomRight.x),
        ) -
        Math.max(
          Math.min(a.topLeft.x, a.bottomRight.x),
          Math.min(b.topLeft.x, b.bottomRight.x),
        );
      const overlapY =
        Math.min(
          Math.max(a.topLeft.y, a.bottomRight.y),
          Math.max(b.topLeft.y, b.bottomRight.y),
        ) -
        Math.max(
          Math.min(a.topLeft.y, a.bottomRight.y),
          Math.min(b.topLeft.y, b.bottomRight.y),
        );
      if (overlapX > 1e-6 && overlapY > 1e-6)
        throw new Error(
          "Manual map page bounds overlap; node placement is ambiguous",
        );
    }
}
function dimensionsAsPoint(dimensions: { width: number; height: number }) {
  return { x: dimensions.width, y: dimensions.height };
}
