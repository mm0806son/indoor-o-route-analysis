import type { EventData, Course } from "../models";
import type { RouteInfo } from "../route-analyzer";
import { findPolygonForPoint } from "../polygon-utils";
import { getActualCourseControls } from "../utils";

export interface LegExportInfo {
  id: number;
  label: string;
  fromControlId: string;
  toControlId: string;
  shortestDistance: number;
  decisionPoints: number;
  alternativeEdges: number;
  difficulty: number;
}

export interface TrainingRoute {
  route: string;
  length: number;
  /** Leg-level difficulty score, carried on every route within the leg. */
  difficulty?: number;
}

export interface TrainingCourse {
  id: string;
  courseName: string;
  classNames?: string[];
  controls: number;
  floors: number[];
  validRoutes: TrainingRoute[][];
}

export interface TrainingEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  exportTime: string;
  country: string;
  eventUrl?: string;
  eventImageUrl?: string;
  mapUrl?: string;
  stairs: string[];
  difficultyScoringModel: string;
  courses: TrainingCourse[];
}

export class TrainingDataIO {
  private static extractStairs(event: EventData): string[] {
    const raceCourse = event.raceCourses?.[0];
    const edges = raceCourse?.edges || [];
    
    const stairLabels = new Set<string>();
    edges.forEach((edge: any) => {
      if (edge.label) {
        const upperLabel = edge.label.toUpperCase();
        if (/^[A-Z]\d*$/.test(upperLabel)) {
          stairLabels.add(upperLabel);
        }
      }
    });
    return Array.from(stairLabels).sort();
  }

  /**
   * Build the training-export course from precomputed routes.
   *
   * @param routes - Routes per leg, keyed by leg id, as produced by
   *   `analyzeCourseLegs(..., findAllRoutes = true)`. This is the same route set
   *   the web app's "show all routes" view displays, so exports match the view.
   */
  static generateCourseData(
    event: EventData,
    course: Course,
    legs: LegExportInfo[],
    routes: Record<number, RouteInfo[]>,
  ): TrainingCourse {
    const raceCourse = event.raceCourses?.[0];
    const controls = raceCourse?.controls || [];
    const polygons = raceCourse?.polygons || [];
    const classAssignments = raceCourse?.classAssignments || [];
    const classNames = classAssignments
      .filter((a) => a.courseName === course.name)
      .map((a) => a.className);
    // Get actual course controls (intermediate start controls removed) for the export
    const courseControls = getActualCourseControls(course.controls || [], controls);
    const courseControlObjects = courseControls
      .map((cc: any) => controls.find((c) => c.id === cc.controlId))
      .filter((c): c is any => Boolean(c));

    const validRoutes = legs.map((leg) => {
      const alternatives = routes[leg.id] ?? [];
      const sorted = [...alternatives].sort((a, b) => a.distance - b.distance);

      // Each route has its own difficulty score, computed by the scoring model
      // on that route's own path. Keep the first (shortest) occurrence per
      // unique route description.
      const routeMap = new Map<string, { distance: number; difficulty: number }>();
      sorted.forEach((r) => {
        const routeDesc = r.description ? r.description.replace(/[,\s]/g, "") : "-";
        if (!routeMap.has(routeDesc)) {
          routeMap.set(routeDesc, { distance: r.distance, difficulty: r.difficulty });
        }
      });

      // Filter unique route names and sort by increasing length.
      const legRoutes: TrainingRoute[] = Array.from(routeMap.entries())
        .sort(([, a], [, b]) => a.distance - b.distance)
        .map(([routeDesc, { distance, difficulty }]) => ({
          route: routeDesc,
          length: Math.round(distance),
          difficulty: Math.round(difficulty),
        }));

      if (legRoutes.length > 0) {
        return legRoutes;
      }
      return [{ route: "-", length: 0, difficulty: Math.round(leg.difficulty) }];
    });

    return {
      id: course.id,
      courseName: course.name || "Untitled Course",
      ...(classNames.length > 0 ? { classNames } : {}),
      // Count controls excluding start and finish
      controls: courseControlObjects.filter((c: any) => c.type !== "start" && c.type !== "finish").length,
      // Determine floor level for each control by finding which polygon contains the control position
      floors: courseControlObjects.map((c: any) => {
        const polygon = findPolygonForPoint(
          { x: c.mapPosition.x, y: c.mapPosition.y },
          polygons
        );
        return polygon?.level ?? 1;
      }),
      validRoutes,
    };
  }

  static generateEventExport(
    event: EventData,
    courses: TrainingCourse[],
    difficultyScoringModel: string,
  ): TrainingEvent {
    const eventDateFormatted = event.startTime?.date ?? new Date().toISOString().split("T")[0];
    const extractedStairs = this.extractStairs(event);

    return {
      eventId: event.id,
      eventName: event.name || "Untitled Event",
      eventDate: eventDateFormatted,
      exportTime: new Date().toISOString(),
      country: event.country || "",
      ...(event.eventUrl ? { eventUrl: event.eventUrl } : {}),
      ...(event.eventImageUrl ? { eventImageUrl: event.eventImageUrl } : {}),
      ...(event.mapDownloadUrl ? { mapUrl: event.mapDownloadUrl } : {}),
      stairs: extractedStairs,
      difficultyScoringModel,
      courses,
    };
  }
}
