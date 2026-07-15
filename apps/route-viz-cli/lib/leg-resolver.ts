import type { EventData } from "@indoor-o-route-analysis/core";
import {
  getActualCourseControls,
  getCourseControlLabels,
} from "@indoor-o-route-analysis/core";

export interface ResolvedLeg {
  fromControlId: string;
  toControlId: string;
  fromLabel: string;
  toLabel: string;
  courseName: string;
}

/**
 * Resolves "--course <name> --leg <from>-<to>" (e.g. "3-4") to control IDs,
 * using the same getActualCourseControls + getCourseControlLabels pipeline
 * as course-analysis.ts, so leg numbering always matches the rest of the app
 * (S / F / 1 / 2 / 3 ...).
 */
export function resolveLegByLabel(event: EventData, courseName: string, legSpec: string): ResolvedLeg {
  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error("No race course data found in event");
  }

  const course = raceCourse.courses?.find((c) => c.name.toLowerCase() === courseName.toLowerCase());
  if (!course) {
    const available = (raceCourse.courses ?? []).map((c) => c.name).join(", ");
    throw new Error(`Course "${courseName}" not found. Available courses: ${available}`);
  }

  const [fromLabel, toLabel] = legSpec.split("-");
  if (!fromLabel || !toLabel) {
    throw new Error(`Invalid --leg "${legSpec}" (expected e.g. "3-4")`);
  }

  const controls = raceCourse.controls ?? [];
  const courseControls = getActualCourseControls(course.controls ?? [], controls);
  const labels = getCourseControlLabels(courseControls, controls);

  const fromIdx = labels.indexOf(fromLabel);
  const toIdx = labels.indexOf(toLabel);
  if (fromIdx === -1 || toIdx === -1) {
    throw new Error(`Leg labels not found in course "${course.name}". Available labels: ${labels.join(", ")}`);
  }

  return {
    fromControlId: courseControls[fromIdx].controlId,
    toControlId: courseControls[toIdx].controlId,
    fromLabel,
    toLabel,
    courseName: course.name,
  };
}
