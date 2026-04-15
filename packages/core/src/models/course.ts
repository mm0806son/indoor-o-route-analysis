// IOF course model

export const DEFAULT_NUMBER_OF_COMPETITORS = 10;

export interface CourseControl {
  controlId: string; // The ID of the Control entity
  mapText?: string;
  type?: "start" | "control" | "finish";
}

export interface Course {
  id: string;
  name: string;
  controls: CourseControl[];
  mapId: string;
  // Extensions to the IOF course model
  numberOfCompetitors?: number;
  /** Target difficulty category for this course (e.g. "white", "yellow", "orange", "purple", "black") */
  targetDifficulty?: string;
}
