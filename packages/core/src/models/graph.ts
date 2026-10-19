// Graph model (IOF extension)

import { MapPosition } from "./map";

export interface StairNode {
  code: string;
  floor: number;
  port: "up" | "down" | "both";
}

export interface Node extends MapPosition {
  stair?: StairNode;
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
