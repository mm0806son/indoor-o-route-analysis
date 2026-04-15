export interface VideoExportSettings {
  width: number;
  height: number;
  fps: number;
  duration: number; // in seconds
  bitrate: number;
  scope: "current-route" | "current-leg" | "all-legs";
}
