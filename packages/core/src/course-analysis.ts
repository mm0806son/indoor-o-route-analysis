import { RouteAnalyzer, type RouteInfo } from "./route-analyzer";
import type { Course, EventData, Control } from "./models";
import { getCourseControlLabels, getActualCourseControls } from "./utils";
import { type DifficultyCategory, type ScoringModel, ScoringModelRegistry } from "./scoring-models";

export type { DifficultyCategory };

/** Per-leg route cap for whole-course analysis. The shortest routes are kept
 * (best-first), so leg metrics are unaffected; full per-leg enumeration is
 * still available via a direct single-leg query. */
const COURSE_OVERVIEW_MAX_ROUTES = 50;

/**
 * Get the difficulty category (color/label) for a given difficulty score.
 * Uses the specified scoring model or falls back to the default model.
 *
 * @param difficulty - The numeric difficulty score
 * @param scoringModel - Optional scoring model to use for categorization
 * @returns The difficulty category with name, label, and colors
 */
export function getDifficultyCategory(difficulty: number, scoringModel?: ScoringModel): DifficultyCategory {
  const model = scoringModel ?? ScoringModelRegistry.getDefaultModel();
  return model.getDifficultyCategory(difficulty);
}

/**
 * Calculate the overall course difficulty from individual leg difficulties.
 * Uses the specified scoring model or falls back to the default model.
 *
 * @param legs - Array of objects containing difficulty scores for each leg
 * @param scoringModel - Optional scoring model to use for calculation
 * @returns The overall course difficulty score
 */
export function getCourseDifficulty(legs: Array<{ difficulty: number }>, scoringModel?: ScoringModel): number {
  const model = scoringModel ?? ScoringModelRegistry.getDefaultModel();
  return model.getCourseDifficulty(legs);
}

/**
 * Calculate the average course difficulty from individual leg difficulties.
 * Uses the specified scoring model or falls back to the default model.
 *
 * @param legs - Array of objects containing difficulty scores for each leg
 * @param scoringModel - Optional scoring model to use for calculation
 * @returns The average course difficulty score
 */
export function getCourseAverageDifficulty(legs: Array<{ difficulty: number }>, scoringModel?: ScoringModel): number {
  const model = scoringModel ?? ScoringModelRegistry.getDefaultModel();
  return model.getCourseAverageDifficulty(legs);
}

/**
 * Represents a single leg in a course analysis
 */
export interface Leg {
  id: number;
  label: string;
  fromControlId: string;
  toControlId: string;
  shortestDistance: number;
  totalClimb?: number;
  decisionPoints: number;
  alternativeEdges: number;
  difficulty: number;
}

/**
 * Result of analyzing all legs in a course
 */
export interface CourseAnalysisResult {
  legs: Leg[];
  routes: Record<number, RouteInfo[]>;
}

/**
 * Progress update during course analysis
 */
export interface CourseAnalysisProgress {
  progress: number;
  legs: Leg[];
  routes: Record<number, RouteInfo[]>;
}

/**
 * Analyzes all legs of a course using the route analyzer.
 * This is an async generator that yields progress updates.
 * 
 * @param course - The course to analyze
 * @param event - The event containing controls and graph data
 * @param routeAnalyzer - Configured RouteAnalyzer instance
 * @param findAllRoutes - Whether to find all alternative routes or filter by unique stair sequences
 */
export async function* analyzeCourseLegsGenerator(
  course: Course,
  event: EventData,
  routeAnalyzer: RouteAnalyzer,
  findAllRoutes: boolean = false,
  k: number = 6
): AsyncGenerator<CourseAnalysisProgress> {
  const controls = event.raceCourses?.[0]?.controls || [];
  // Get actual course controls (intermediate start controls removed)
  const courseControls = getActualCourseControls(course.controls || [], controls);

  if (courseControls.length < 2) {
    yield { progress: 100, legs: [], routes: {} };
    return;
  }

  const courseControlLabels = getCourseControlLabels(courseControls, controls);

  const legs: Leg[] = [];
  const routes: Record<number, RouteInfo[]> = {};
  const totalSteps = courseControls.length - 1;
  // Store shortest paths from previous legs
  const previousShortestPaths: string[][] = [];

  for (let i = 0; i < totalSteps; i++) {
    // Yield to event loop to keep UI responsive
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const fromControlId = courseControls[i].controlId;
      const toControlId = courseControls[i + 1].controlId;

      const fromControl = controls.find((c) => c.id === fromControlId);
      const toControl = controls.find((c) => c.id === toControlId);

      if (fromControlId !== toControlId && fromControl && toControl) {
        // Calculate alternative routes — use exhaustive search when findAllRoutes is enabled
        const allAlternatives = findAllRoutes
          ? routeAnalyzer.findAllAlternativePathsBetweenControls(fromControlId, toControlId, COURSE_OVERVIEW_MAX_ROUTES)
          : routeAnalyzer.findAlternativePathsBetweenControls(fromControlId, toControlId, k);

        // Ensure sorted by distance (shortest first)
        allAlternatives.sort((a, b) => a.distance - b.distance);

        // Calculate Repetition Ratio for all alternatives
        allAlternatives.forEach(route => {
          route.repetitionRatio = routeAnalyzer.calculateRepetitionRatio(route.path, previousShortestPaths);
        });

        const bestRoute = allAlternatives[0];

        // Update visited paths with the shortest route of this leg
        if (bestRoute) {
          previousShortestPaths.push(bestRoute.path);
        }

        const distance = bestRoute ? bestRoute.distance : 0;
        const totalClimb = bestRoute ? bestRoute.totalClimb : 0;
        const difficulty = bestRoute ? bestRoute.difficulty : 0;
        const decisionPoints = bestRoute ? bestRoute.decisionPoints : 0;
        const alternativeEdges = bestRoute ? bestRoute.alternativeEdges : 0;

        // Filter alternatives if "find all routes" is unchecked
        let alternatives: RouteInfo[] = allAlternatives;
        if (!findAllRoutes) {
          const uniqueStairSequences = new Set<string>();
          alternatives = allAlternatives.filter((route) => {
            const stairSeq = routeAnalyzer.getStairSequence(route.path);
            if (uniqueStairSequences.has(stairSeq)) {
              return false;
            }
            uniqueStairSequences.add(stairSeq);
            return true;
          });
          // Limit to k routes when filtering
          alternatives = alternatives.slice(0, k);
        }

        const fromLabel = courseControlLabels[i];
        const toLabel = courseControlLabels[i + 1];

        const leg: Leg = {
          id: i,
          label: `${fromLabel} → ${toLabel}`,
          fromControlId,
          toControlId,
          shortestDistance: distance,
          totalClimb,
          decisionPoints,
          alternativeEdges,
          difficulty,
        };

        legs.push(leg);
        routes[i] = alternatives;
      }
    } catch (error) {
      console.error("Error analyzing leg", i, error);
    }

    const progress = Math.round(((i + 1) / totalSteps) * 100);
    yield {
      progress,
      legs: [...legs],
      routes: { ...routes },
    };
  }
}

/**
 * Synchronously analyzes all legs of a course (non-generator version).
 * Use the generator version for large courses to avoid blocking the UI.
 */
export function analyzeCourseLegs(
  course: Course,
  event: EventData,
  routeAnalyzer: RouteAnalyzer,
  findAllRoutes: boolean = false,
  maxRoutes: number = COURSE_OVERVIEW_MAX_ROUTES
): CourseAnalysisResult {
  const controls = event.raceCourses?.[0]?.controls || [];
  // Get actual course controls (intermediate start controls removed)
  const courseControls = getActualCourseControls(course.controls || [], controls);

  if (courseControls.length < 2) {
    return { legs: [], routes: {} };
  }

  const courseControlLabels = getCourseControlLabels(courseControls, controls);

  const legs: Leg[] = [];
  const routes: Record<number, RouteInfo[]> = {};
  // Store shortest paths from previous legs
  const previousShortestPaths: string[][] = [];

  for (let i = 0; i < courseControls.length - 1; i++) {
    try {
      const fromControlId = courseControls[i].controlId;
      const toControlId = courseControls[i + 1].controlId;

      const fromControl = controls.find((c) => c.id === fromControlId);
      const toControl = controls.find((c) => c.id === toControlId);

      if (fromControlId !== toControlId && fromControl && toControl) {
        // Use exhaustive search when findAllRoutes is enabled
        const allAlternatives = findAllRoutes
          ? routeAnalyzer.findAllAlternativePathsBetweenControls(fromControlId, toControlId, maxRoutes)
          : routeAnalyzer.findAlternativePathsBetweenControls(fromControlId, toControlId, 6);
        allAlternatives.sort((a, b) => a.distance - b.distance);

        // Calculate Repetition Ratio for all alternatives
        allAlternatives.forEach(route => {
          route.repetitionRatio = routeAnalyzer.calculateRepetitionRatio(route.path, previousShortestPaths);
        });

        const bestRoute = allAlternatives[0];

        // Update visited paths with the shortest route of this leg
        if (bestRoute) {
          previousShortestPaths.push(bestRoute.path);
        }
        
        let alternatives: RouteInfo[] = allAlternatives;
        if (!findAllRoutes) {
          const uniqueStairSequences = new Set<string>();
          alternatives = allAlternatives.filter((route) => {
            const stairSeq = routeAnalyzer.getStairSequence(route.path);
            if (uniqueStairSequences.has(stairSeq)) {
              return false;
            }
            uniqueStairSequences.add(stairSeq);
            return true;
          });
          alternatives = alternatives.slice(0, 6);
        }

        const fromLabel = courseControlLabels[i];
        const toLabel = courseControlLabels[i + 1];

        legs.push({
          id: i,
          label: `${fromLabel} → ${toLabel}`,
          fromControlId,
          toControlId,
          shortestDistance: bestRoute?.distance ?? 0,
          decisionPoints: bestRoute?.decisionPoints ?? 0,
          alternativeEdges: bestRoute?.alternativeEdges ?? 0,
          difficulty: bestRoute?.difficulty ?? 0,
        });

        routes[i] = alternatives;
      }
    } catch (error) {
      console.error("Error analyzing leg", i, error);
    }
  }

  return { legs, routes };
}
