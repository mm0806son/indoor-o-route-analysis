/**
 * Output formatters for JSON and CSV.
 */

// ── Shared types ────────────────────────────────────────────────────────────

export interface ShortestPathResult {
  from: string;
  to: string;
  path: string[];
  description: string;
  labels: string[];
  distance: number;
  difficulty: number;
  difficultyCategory: string;
  decisionPoints: number;
  alternativeEdges: number;
  totalClimb?: number;
}

export interface HumanShortestPathResult extends ShortestPathResult {
  /** True if solved by the same-floor short-circuit (no stair search happened). */
  sameFloor: boolean;
  /** Narration of the search, one line per exploration/backtracking step. */
  narration: string[];
  /** Expansion steps ("glances") before the plan closed. */
  mentalSteps: number;
  /** Stair crossings in the final plan (working-memory chunks). */
  planDepth: number;
  /** Combined score for ranking legs by how hard they were to think through. */
  cognitiveEffortScore: number;
  /** Route-length ratio vs. the true shortest route; a large gap flags a potential "bait" leg. */
  humanOptimalGap?: number;
}

export interface LegResult {
  leg: string;
  fromControlId: string;
  toControlId: string;
  distance: number;
  difficulty: number;
  difficultyCategory: string;
  decisionPoints: number;
  alternativeEdges: number;
  description: string;
  labels: string[];
  totalClimb?: number;
}

export interface CourseResult {
  courseName: string;
  legs: number;
  totalDistance: number;
  maxDifficulty: number;
  maxDifficultyCategory: string;
  avgDifficulty: number;
  targetDifficulty: string;
  legDetails: LegResult[];
}

export interface AllCoursesResult {
  eventName: string;
  eventDate: string;
  courses: CourseSummary[];
}

export interface CourseSummary {
  courseName: string;
  legs: number;
  totalDistance: number;
  maxDifficulty: number;
  maxDifficultyCategory: string;
  avgDifficulty: number;
  targetDifficulty: string;
}

// ── JSON formatter ──────────────────────────────────────────────────────────

export function formatJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ── CSV formatters ──────────────────────────────────────────────────────────

function csvEscape(value: string | number | undefined): string {
  if (value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: (string | number | undefined)[]): string {
  return values.map(csvEscape).join(",");
}

export function formatShortestPathCSV(result: ShortestPathResult): string {
  const headers = [
    "From",
    "To",
    "Path",
    "Description",
    "Distance (m)",
    "Difficulty",
    "Category",
    "Decision Points",
    "Alternative Edges",
    "Total Climb (m)",
  ];
  const row = [
    result.from,
    result.to,
    result.path.join(" → "),
    result.description,
    round(result.distance),
    round(result.difficulty),
    result.difficultyCategory,
    result.decisionPoints,
    result.alternativeEdges,
    result.totalClimb !== undefined ? round(result.totalClimb) : "",
  ];
  return csvRow(headers) + "\n" + csvRow(row) + "\n";
}

export function formatHumanShortestPathCSV(result: HumanShortestPathResult): string {
  const headers = [
    "From",
    "To",
    "Path",
    "Description",
    "Distance (m)",
    "Difficulty",
    "Category",
    "Decision Points",
    "Alternative Edges",
    "Total Climb (m)",
    "Same Floor",
    "Mental Steps",
    "Plan Depth",
    "Cognitive Effort Score",
    "Human/Optimal Gap",
    "Narration",
  ];
  const row = [
    result.from,
    result.to,
    result.path.join(" → "),
    result.description,
    round(result.distance),
    round(result.difficulty),
    result.difficultyCategory,
    result.decisionPoints,
    result.alternativeEdges,
    result.totalClimb !== undefined ? round(result.totalClimb) : "",
    String(result.sameFloor),
    result.mentalSteps,
    result.planDepth,
    round(result.cognitiveEffortScore, 2),
    result.humanOptimalGap !== undefined ? round(result.humanOptimalGap, 2) : "",
    result.narration.join(" | "),
  ];
  return csvRow(headers) + "\n" + csvRow(row) + "\n";
}

export function formatCourseCSV(result: CourseResult): string {
  const headers = [
    "Leg",
    "From",
    "To",
    "Distance (m)",
    "Difficulty",
    "Category",
    "Decision Points",
    "Alternative Edges",
    "Description",
    "Total Climb (m)",
  ];
  const rows = result.legDetails.map((leg) =>
    csvRow([
      leg.leg,
      leg.fromControlId,
      leg.toControlId,
      round(leg.distance),
      round(leg.difficulty),
      leg.difficultyCategory,
      leg.decisionPoints,
      leg.alternativeEdges,
      leg.description,
      leg.totalClimb !== undefined ? round(leg.totalClimb) : "",
    ]),
  );
  return csvRow(headers) + "\n" + rows.join("\n") + "\n";
}

export function formatAllCoursesCSV(result: AllCoursesResult): string {
  const headers = [
    "Course",
    "Legs",
    "Total Distance (m)",
    "Max Difficulty",
    "Max Difficulty Category",
    "Avg Difficulty",
    "Target Difficulty",
  ];
  const rows = result.courses.map((c) =>
    csvRow([
      c.courseName,
      c.legs,
      round(c.totalDistance),
      round(c.maxDifficulty),
      c.maxDifficultyCategory,
      round(c.avgDifficulty),
      c.targetDifficulty,
    ]),
  );
  return csvRow(headers) + "\n" + rows.join("\n") + "\n";
}

function round(n: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
