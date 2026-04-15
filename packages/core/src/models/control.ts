import { MapPosition } from "./map";

// IOF control model
export interface Control {
  id: string; // The control code (e.g. "31")
  type: "start" | "control" | "finish";
  mapPosition: MapPosition;
  mapText?: string;
}
