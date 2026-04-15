export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface UtmCoordinate {
  x: number;
  y: number;
  zone: number;
  band: string;
  isSouthern: boolean;
}

const K0 = 0.9996;

const A = 6378137.0; // WGS84 Semi-major axis
const E = 0.081819191; // WGS84 Eccentricity
const E_SQ = Math.pow(E, 2);

const TO_RADIANS = Math.PI / 180;
const TO_DEGREES = 180 / Math.PI;

export function latLonToUtm(latitude: number, longitude: number): UtmCoordinate {
  const isSouthern = latitude < 0;
  const zone = Math.floor((longitude + 180) / 6) + 1;
  const zoneCentralMeridian = (zone - 1) * 6 - 180 + 3;

  const phi = latitude * TO_RADIANS;
  const lambda = longitude * TO_RADIANS;
  const lambda0 = zoneCentralMeridian * TO_RADIANS;

  const N = A / Math.sqrt(1 - E_SQ * Math.sin(phi) * Math.sin(phi));
  const T = Math.pow(Math.tan(phi), 2);
  const C = (E_SQ / (1 - E_SQ)) * Math.pow(Math.cos(phi), 2);
  const AA = (lambda - lambda0) * Math.cos(phi);

  const M =
    A *
    ((1 - E_SQ / 4 - (3 * Math.pow(E_SQ, 2)) / 64 - (5 * Math.pow(E_SQ, 3)) / 256) * phi -
      ((3 * E_SQ) / 8 + (3 * Math.pow(E_SQ, 2)) / 32 + (45 * Math.pow(E_SQ, 3)) / 1024) * Math.sin(2 * phi) +
      ((15 * Math.pow(E_SQ, 2)) / 256 + (45 * Math.pow(E_SQ, 3)) / 1024) * Math.sin(4 * phi) -
      ((35 * Math.pow(E_SQ, 3)) / 3072) * Math.sin(6 * phi));

  let x =
    K0 *
    N *
    (AA +
      ((1 - T + C) * Math.pow(AA, 3)) / 6 +
      ((5 - 18 * T + Math.pow(T, 2) + 72 * C - 58 * E_SQ) * Math.pow(AA, 5)) / 120);
  x += 500000; // False Easting

  let y =
    K0 *
    (M +
      N *
        Math.tan(phi) *
        (Math.pow(AA, 2) / 2 +
          ((5 - T + 9 * C + 4 * Math.pow(C, 2)) * Math.pow(AA, 4)) / 24 +
          ((61 - 58 * T + Math.pow(T, 2) + 600 * C - 330 * E_SQ) * Math.pow(AA, 6)) / 720));

  if (isSouthern) {
    y += 10000000; // False Northing
  }

  return {
    x,
    y,
    zone,
    band: getUtmLetterDesignator(latitude),
    isSouthern,
  };
}

export function utmToLatLon(x: number, y: number, zone: number, isSouthern: boolean): LatLon {
  const x_adjusted = x - 500000;
  const y_adjusted = isSouthern ? y - 10000000 : y;

  const M = y_adjusted / K0;
  const mu =
    M /
    (A *
      (1 -
        E_SQ / 4 -
        (3 * Math.pow(E_SQ, 2)) / 64 -
        (5 * Math.pow(E_SQ, 3)) / 256));

  const e1 = (1 - Math.sqrt(1 - E_SQ)) / (1 + Math.sqrt(1 - E_SQ));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * Math.pow(e1, 2)) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu);

  const N1 = A / Math.sqrt(1 - E_SQ * Math.pow(Math.sin(phi1), 2));
  const T1 = Math.pow(Math.tan(phi1), 2);
  const C1 = (E_SQ / (1 - E_SQ)) * Math.pow(Math.cos(phi1), 2);
  const R1 = (A * (1 - E_SQ)) / Math.pow(1 - E_SQ * Math.pow(Math.sin(phi1), 2), 1.5);
  const D = x_adjusted / (N1 * K0);

  const latRad =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (Math.pow(D, 2) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * Math.pow(C1, 2) - 9 * E_SQ) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * Math.pow(T1, 2) - 252 * E_SQ - 3 * Math.pow(C1, 2)) *
          Math.pow(D, 6)) /
          720);

  const longRad =
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * Math.pow(C1, 2) + 8 * E_SQ + 24 * Math.pow(T1, 2)) *
        Math.pow(D, 5)) /
        120) /
    Math.cos(phi1);

  const zoneCentralMeridian = (zone - 1) * 6 - 180 + 3;
  
  const latitude = latRad * TO_DEGREES;
  const longitude = (longRad * TO_DEGREES) + zoneCentralMeridian;

  return { latitude, longitude };
}

/**
 * Calculates the latitude and longitude for a given point on a map,
 * based on a georeferenced top-left corner.
 *
 * @param mapPoint - The point in map coordinates (typically mm)
 * @param mapScale - The scale of the map (e.g., 4000 for 1:4000)
 * @param reference - The georeferencing information for the map's top-left corner
 * @returns The calculated latitude and longitude, or null if reference is invalid
 */
export function calculateLatLonFromMapPoint(
  mapPoint: { x: number; y: number },
  mapScale: number,
  reference: { latitude: number; longitude: number }
): LatLon | null {
  if (
    reference.latitude === undefined ||
    reference.longitude === undefined ||
    isNaN(reference.latitude) ||
    isNaN(reference.longitude)
  ) {
    return null;
  }

  const utmRef = latLonToUtm(reference.latitude, reference.longitude);
  // mapPoint is typically in Millimeters. Scale is 1:N.
  // 1 mm on map = N mm in world = N/1000 meters in world.
  const dE = (mapPoint.x * mapScale) / 1000;
  const dN = -(mapPoint.y * mapScale) / 1000; // y down on screen -> y down (South) on map = negative delta North

  const currentUtmX = utmRef.x + dE;
  const currentUtmY = utmRef.y + dN;

  const currentLL = utmToLatLon(currentUtmX, currentUtmY, utmRef.zone, utmRef.isSouthern);

  if (isNaN(currentLL.latitude) || isNaN(currentLL.longitude)) {
    return null;
  }

  return currentLL;
}

function getUtmLetterDesignator(latitude: number): string {
  if (84 >= latitude && latitude >= 72) return "X";
  else if (72 > latitude && latitude >= 64) return "W";
  else if (64 > latitude && latitude >= 56) return "V";
  else if (56 > latitude && latitude >= 48) return "U";
  else if (48 > latitude && latitude >= 40) return "T";
  else if (40 > latitude && latitude >= 32) return "S";
  else if (32 > latitude && latitude >= 24) return "R";
  else if (24 > latitude && latitude >= 16) return "Q";
  else if (16 > latitude && latitude >= 8) return "P";
  else if (8 > latitude && latitude >= 0) return "N";
  else if (0 > latitude && latitude >= -8) return "M";
  else if (-8 > latitude && latitude >= -16) return "L";
  else if (-16 > latitude && latitude >= -24) return "K";
  else if (-24 > latitude && latitude >= -32) return "J";
  else if (-32 > latitude && latitude >= -40) return "H";
  else if (-40 > latitude && latitude >= -48) return "G";
  else if (-48 > latitude && latitude >= -56) return "F";
  else if (-56 > latitude && latitude >= -64) return "E";
  else if (-64 > latitude && latitude >= -72) return "D";
  else if (-72 > latitude && latitude >= -80) return "C";
  else return "Z";
}
