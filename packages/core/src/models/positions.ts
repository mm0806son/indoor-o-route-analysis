/**
 * Position types to enforce type safety and clarity across transformations.
 * See docs/coordinate-systems.md for detailed explanations.
 */

/**
 * Represents a position in the 3D world space.
 * Units: Meters (m)
 * X: Positive East (Right relative to map image)
 * Y: Positive North (Up relative to map image)
 * Z: Elevation (defined by level elevation)
 */
export interface WorldPosition {
  x: number;
  y: number;
  z?: number; // Optional elevation
}

/**
 * Represents a position on the screen/canvas.
 * Units: Pixels (px)
 * Origin: Top-Left of the component/canvas
 */
export interface ScreenPosition {
  x: number;
  y: number;
}

/**
 * Represents a geographical position.
 * Units: Degrees
 * Standard: WGS84
 */
export interface GeoPosition {
  latitude: number;
  longitude: number;
}
