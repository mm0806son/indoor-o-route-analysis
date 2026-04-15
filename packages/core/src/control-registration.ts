import type { MapPosition } from "./models/map";

/**
 * Calculates the map coordinate transform (top-left and bottom-right corners in
 * IOF event coordinate space) from two control–registration-mark pairs.
 *
 * Each control has a known position in the IOF event coordinate system
 * (`controlEventPos`), and the user places a registration mark at the
 * corresponding location in the document coordinate system (`documentPosMm`,
 * in millimetres measured from the top-left corner of the PDF page).
 *
 * The transform is a simple axis-aligned affine mapping:
 *
 *   eventX = TL.x + (docX / docWidth)  * (BR.x - TL.x)
 *   eventY = TL.y + (docY / docHeight) * (BR.y - TL.y)
 *
 * Given two pairs we can solve for TL and BR on each axis independently:
 *
 *   e1 = TL + u1 * span       (u = doc / docSize, span = BR - TL)
 *   e2 = TL + u2 * span
 *
 *   span = (e1 - e2) / (u1 - u2)
 *   TL   = e1 - u1 * span
 *   BR   = TL + span
 *
 * @param c1Event  Event-space position of first control
 * @param c1Doc    Document-space position (mm) of first registration mark
 * @param c2Event  Event-space position of second control
 * @param c2Doc    Document-space position (mm) of second registration mark
 * @param docWidth Document (image) width in mm
 * @param docHeight Document (image) height in mm
 * @returns  New top-left and bottom-right corners in event coordinate space,
 *           or `null` if the two marks are too close on either axis.
 */
export function calculateTransformFromControlPairs(
  c1Event: MapPosition,
  c1Doc: MapPosition,
  c2Event: MapPosition,
  c2Doc: MapPosition,
  docWidth: number,
  docHeight: number,
): { topLeft: MapPosition; bottomRight: MapPosition } | null {
  // Normalised document coordinates (0..1)
  const u1x = c1Doc.x / docWidth;
  const u1y = c1Doc.y / docHeight;
  const u2x = c2Doc.x / docWidth;
  const u2y = c2Doc.y / docHeight;

  const duX = u1x - u2x;
  const duY = u1y - u2y;

  // Need sufficient separation on both axes
  if (Math.abs(duX) < 1e-4 || Math.abs(duY) < 1e-4) {
    return null;
  }

  // Solve for each axis
  const spanX = (c1Event.x - c2Event.x) / duX;
  const tlX = c1Event.x - u1x * spanX;

  const spanY = (c1Event.y - c2Event.y) / duY;
  const tlY = c1Event.y - u1y * spanY;

  return {
    topLeft: { x: tlX, y: tlY },
    bottomRight: { x: tlX + spanX, y: tlY + spanY },
  };
}
