/** A selected leg keeps its control markers even while its answer is hidden. */
export interface LabsDisplayedRoute {
  path: string[];
  distance: number;
  fromLabel?: string;
  toLabel?: string;
  forwardSegmentCount?: number;
  /** Other labs show their selected route by default. Human playback sets this per frame. */
  showPath?: boolean;
}
