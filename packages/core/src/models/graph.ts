// Graph model (IOF extension)

import { MapPosition } from "./map";

export interface Node extends MapPosition {
  id: string;
  x: number;
  y: number;
}

export interface Edge {
  from: string;
  to: string;
  label: string;
  reverseLabel?: string;
  oneWay?: boolean;
  ignoreLength?: boolean; // "map-segment transition" in the UI/docs; renamed from teleport
}
