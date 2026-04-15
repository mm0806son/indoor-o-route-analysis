import { Vector3 } from "three";
import { latLonToUtm, utmToLatLon } from "./geo-utils";
import type { ScreenPosition, WorldPosition, GeoPosition } from "./models/positions";
import type { MapData, MapPosition } from "./models/map";
import type { Polygon } from "./models/polygon";

/** Default height per floor level (meters) when polygon.elevation is not set. */
export const DEFAULT_FLOOR_HEIGHT = 3.0;

/**
 * Transforms a position from Screen coordinates (pixels) to map coordinates (mm).
 * @param screenPos Position in screen pixels
 * @param pan Pan offset in pixels
 * @param zoom Zoom level
 * @param pixelsPerMM Pixels per millimeter (derived from screen resolution or base scale)
 * @returns Position in Map Document coordinates (mm)
 */
export function screenToMap(
  screenPos: ScreenPosition,
  pan: { x: number; y: number },
  zoom: number,
  pixelsPerMM: number
): MapPosition {
  return {
    x: (screenPos.x - pan.x) / zoom / pixelsPerMM,
    y: (screenPos.y - pan.y) / zoom / pixelsPerMM,
  };
}

/**
 * Transforms a position from map coordinates (mm) to screen coordinates (pixels).
 * @param mapPos Position in map coordinates (mm)
 * @param pan Pan offset in pixels
 * @param zoom Zoom level
 * @param pixelsPerMM Pixels per millimeter
 * @returns Position in screen pixels
 */
export function mapToScreen(
  mapPos: MapPosition,
  pan: { x: number; y: number },
  zoom: number,
  pixelsPerMM: number
): ScreenPosition {
  return {
    x: mapPos.x * pixelsPerMM * zoom + pan.x,
    y: mapPos.y * pixelsPerMM * zoom + pan.y,
  };
}

/**
 * Computes the elevation for a polygon.
 * Uses explicit elevation if set, otherwise falls back to level * DEFAULT_FLOOR_HEIGHT.
 */
export function getPolygonElevation(polygon: Polygon): number {
  return polygon.elevation ?? (polygon.level * DEFAULT_FLOOR_HEIGHT);
}

/**
 * Returns the effective calibration points for determining coordinate flip direction.
 * Uses per-page transform[0] when pageTransformMode === 'manual', because the global
 * calibration may use a different convention (e.g. screen Y-down) than the per-page
 * transforms (e.g. outdoor Y-up/northward).
 */
function getEffectiveCalibration(mapData: MapData): { tl: MapPosition | undefined; br: MapPosition | undefined } {
  if (mapData.pageTransformMode === 'manual' && mapData.pageTransforms?.[0]) {
    return {
      tl: mapData.pageTransforms[0].topLeft,
      br: mapData.pageTransforms[0].bottomRight,
    };
  }
  return {
    tl: mapData.mapPositionTopLeft,
    br: mapData.mapPositionBottomRight,
  };
}

/**
 * Returns true if IOF map X should be negated in world space.
 * Occurs when topLeft.x > bottomRight.x (map X increases to the left).
 */
function shouldFlipX(mapData: MapData): boolean {
  const { tl, br } = getEffectiveCalibration(mapData);
  return !!(tl && br && tl.x > br.x);
}

/**
 * Returns true if IOF map Y should be negated in world space.
 * Occurs when topLeft.y < bottomRight.y (screen convention, Y increases down).
 * For outdoor/north-up maps topLeft.y > bottomRight.y and no flip is needed.
 */
function shouldFlipY(mapData: MapData): boolean {
  const { tl, br } = getEffectiveCalibration(mapData);
  return !!(tl && br && tl.y < br.y);
}

/**
 * Transforms a position from map (IOF) coordinates (mm) to 3D world coordinates (meters).
 *
 * World coordinate system (right-handed, Z-up):
 * - X: increases to the right (east)
 * - Y: increases upward (north)
 * - Z: elevation in meters
 *
 * polygon.origin is used as the XY reference point, guaranteeing floor-to-floor
 * alignment — every floor has world (0,0) at the same physical location.
 * The flip direction is derived from the calibration convention (per-page for
 * manual multi-page maps, global otherwise).
 *
 * @param mapPos  Position in IOF map coordinates (mm)
 * @param mapData Map data (scale, calibration, page layout)
 * @param elevation Optional Z elevation in meters. Defaults to 0.
 */
export function mapToWorld(mapPos: MapPosition, mapData: MapData, elevation?: number): WorldPosition;
/**
 * Overload that extracts elevation and origin from the polygon.
 */
export function mapToWorld(mapPos: MapPosition, polygon: Polygon, mapData: MapData): WorldPosition;
export function mapToWorld(
  mapPos: MapPosition,
  mapDataOrPolygon: MapData | Polygon,
  elevationOrMapData?: number | MapData
): WorldPosition {
  let mapData: MapData;
  let elevation: number;
  let origin: MapPosition;

  if ('scale' in mapDataOrPolygon) {
    mapData = mapDataOrPolygon;
    elevation = typeof elevationOrMapData === 'number' ? elevationOrMapData : 0;
    origin = mapData.mapPositionTopLeft ?? { x: 0, y: 0 };
  } else {
    const polygon = mapDataOrPolygon as Polygon;
    mapData = elevationOrMapData as MapData;
    elevation = getPolygonElevation(polygon);
    origin = polygon.origin ?? { x: 0, y: 0 };
  }

  const scaleFactor = mapData.scale / 1000;
  let x = (mapPos.x - origin.x) * scaleFactor;
  let y = (mapPos.y - origin.y) * scaleFactor;

  if (shouldFlipX(mapData)) x = -x;
  if (shouldFlipY(mapData)) y = -y;

  return { x, y, z: elevation };
}

/**
 * Inverse of mapToWorld — transforms 3D world coordinates back to IOF map
 * coordinates (mm).
 *
 * @param worldPos Position in world coordinates (meters)
 * @param mapData  Map data (scale, calibration, page layout)
 */
export function worldToMap(worldPos: WorldPosition, mapData: MapData): MapPosition;
/**
 * Overload that uses the polygon's origin as the XY reference (matches mapToWorld).
 */
export function worldToMap(worldPos: WorldPosition, polygon: Polygon, mapData: MapData): MapPosition;
export function worldToMap(
  worldPos: WorldPosition,
  mapDataOrPolygon: MapData | Polygon,
  mapDataArg?: MapData
): MapPosition {
  let mapData: MapData;
  let origin: MapPosition;

  if ('scale' in mapDataOrPolygon) {
    mapData = mapDataOrPolygon;
    origin = mapData.mapPositionTopLeft ?? { x: 0, y: 0 };
  } else {
    const polygon = mapDataOrPolygon as Polygon;
    mapData = mapDataArg as MapData;
    origin = polygon.origin ?? { x: 0, y: 0 };
  }

  const scaleFactor = mapData.scale / 1000;
  const flipX = shouldFlipX(mapData);
  const flipY = shouldFlipY(mapData);

  return {
    x: (flipX ? -worldPos.x : worldPos.x) / scaleFactor + origin.x,
    y: (flipY ? -worldPos.y : worldPos.y) / scaleFactor + origin.y,
  };
}

/**
 * Converts a WorldPosition to a Three.js Vector3.
 * @param worldPos Position in world coordinates (Meters)
 * @returns Three.js Vector3 with x, y, z
 */
export function worldToVector3(worldPos: WorldPosition): Vector3 {
  return new Vector3(worldPos.x, worldPos.y, worldPos.z ?? 0);
}

/**
 * Transforms a position from map coordinates (mm) to Geographical coordinates (Lat/Lon).
 * Requires mapData to be georeferenced (latitude/longitude at TopLeft).
 * Uses UTM projection with approximation that scale is constant and orientation is North-Up.
 * 
 * @param mapPos Position in map coordinates (mm)
 * @param mapData The map data containing scale and top-left geo reference
 * @returns Geographical Position or null if map is not georeferenced
 */
export function mapToGeo(
  mapPos: MapPosition,
  mapData: MapData
): GeoPosition | null {
  if (
    mapData.latitude === undefined ||
    mapData.longitude === undefined ||
    isNaN(mapData.latitude) ||
    isNaN(mapData.longitude)
  ) {
    return null;
  }

  // Use the logic from geo-utils/calculateLatLonFromMapPoint but re-implemented/wrapped 
  // to ensure type consistency and dependency cleanliness if needed. 
  // Here we use geo-utils primitives.
  
  const utmRef = latLonToUtm(mapData.latitude, mapData.longitude);
  
  // 1 mm on map = mapData.scale mm in world = mapData.scale / 1000 meters
  const dE = (mapPos.x * mapData.scale) / 1000;
  const dN = -(mapPos.y * mapData.scale) / 1000; // Map Y Down -> North decrease

  const currentUtmX = utmRef.x + dE;
  const currentUtmY = utmRef.y + dN;

  const currentLL = utmToLatLon(currentUtmX, currentUtmY, utmRef.zone, utmRef.isSouthern);

  if (isNaN(currentLL.latitude) || isNaN(currentLL.longitude)) {
    return null;
  }

  return {
    latitude: currentLL.latitude,
    longitude: currentLL.longitude
  };
}

/**
 * Transforms a position from Geographical coordinates (Lat/Lon) to map coordinates (mm).
 * Requires mapData to be georeferenced.
 * 
 * @param geoPos Geographical Position
 * @param mapData The map data containing scale and top-left geo reference
 * @returns Position in map coordinates (mm) or null if map not georeferenced
 */
export function geoToMap(
  geoPos: GeoPosition,
  mapData: MapData
): MapPosition | null {
  if (
    mapData.latitude === undefined ||
    mapData.longitude === undefined ||
    isNaN(mapData.latitude) ||
    isNaN(mapData.longitude)
  ) {
    return null;
  }

  const utmRef = latLonToUtm(mapData.latitude, mapData.longitude);
  const utmTarget = latLonToUtm(geoPos.latitude, geoPos.longitude);

  // Note: This simple subtraction assumes both points are in the same UTM zone.
  // For small indoor maps, this is usually true. 
  
  const dE = utmTarget.x - utmRef.x;
  const dN = utmTarget.y - utmRef.y;

  // mapX = dE * 1000 / scale
  // dN = -mapY * scale / 1000 => mapY = -dN * 1000 / scale

  return {
    x: (dE * 1000) / mapData.scale,
    y: (-dN * 1000) / mapData.scale
  };
}
