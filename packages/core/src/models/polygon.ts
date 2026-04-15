import { MapPosition } from "./map";

export interface Polygon {
  id: string;
  points: MapPosition[];
  holes?: Array<MapPosition[]>; // Optional holes in the polygon
  level: number; // Level number
  elevation?: number; // in m
  origin?: MapPosition; // XY origin point -used when transforming to/from world coordinates
}
