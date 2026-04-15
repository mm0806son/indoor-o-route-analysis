import type { EventData, Course } from "../models";
import type { RouteAnalyzer } from "../route-analyzer";
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
  id: string;
  eventName: string;
  eventDate: string;
  exportTime: string;
  country: string;
  eventUrl?: string;
  eventImageUrl?: string;
  mapUrl?: string;
  stairs: string[];
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

  static generateCourseData(
    event: EventData,
    course: Course,
    legs: LegExportInfo[],
    routeAnalyzer: RouteAnalyzer,
    k: number = 6,
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
      const alternatives = routeAnalyzer.findAlternativePathsBetweenControls(leg.fromControlId, leg.toControlId, k);
      const sorted = [...alternatives].sort((a, b) => a.distance - b.distance);

      const routeMap = new Map<string, number>();
      sorted.forEach((r) => {
        const routeDesc = r.description ? r.description.replace(/[,\s]/g, "") : "-";
        if (!routeMap.has(routeDesc)) {
          routeMap.set(routeDesc, r.distance);
        }
      });

      // Filter unique route names and sort by increasing length
      const routes = Array.from(routeMap)
        .sort(([, distanceA], [, distanceB]) => distanceA - distanceB)
        .map(([routeDesc, distance]) => ({
          route: routeDesc,
          length: Math.round(distance),
        }));

      return routes.length > 0 ? routes : [{ route: "-", length: 0 }];
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
    courses: TrainingCourse[]
  ): TrainingEvent {
    const eventDateFormatted = event.startTime?.date ?? new Date().toISOString().split("T")[0];
    const extractedStairs = this.extractStairs(event);
    
    return {
      id: event.id,
      eventName: event.name || "Untitled Event",
      eventDate: eventDateFormatted,
      exportTime: new Date().toISOString(),
      country: event.country || "",
      ...(event.eventUrl ? { eventUrl: event.eventUrl } : {}),
      ...(event.eventImageUrl ? { eventImageUrl: event.eventImageUrl } : {}),
      ...(event.mapDownloadUrl ? { mapUrl: event.mapDownloadUrl } : {}),
      stairs: extractedStairs,
      courses,
    };
  }

  // Deprecated: Kept for backward compatibility if needed, but updated to use new structure logic
  static generateExportData(
    event: EventData,
    course: Course,
    legs: LegExportInfo[],
    routeAnalyzer: RouteAnalyzer,
    k: number = 6,
  ): any {
    const trainingCourse = this.generateCourseData(event, course, legs, routeAnalyzer, k);
    const trainingEvent = this.generateEventExport(event, [trainingCourse]);
    
    // Return old structure for compatibility if any consumers rely on it
    // But aligning with returning a single course object wrapped in old config style
    // "config" property was removed in user request, but if I need to support old code temporarily:
    // The user requested: "change the training app json export format [...] remove exportDate"
    // So I should return the new TrainingEvent structure.
    
    return trainingEvent;
  }
}
