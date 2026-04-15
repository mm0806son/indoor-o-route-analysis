#!/usr/bin/env tsx
/**
 * route-cli — Indoor orienteering route analysis CLI tool.
 *
 * Commands:
 *   shortest-path  Find shortest path between two controls/nodes
 *   analyze-course Analyze a specific course (leg-by-leg)
 *   analyze-all    Analyze all courses in the event
 *
 * Usage:
 *   route-cli <file> shortest-path --from <id> --to <id> [options]
 *   route-cli <file> analyze-course --course <name> [options]
 *   route-cli <file> analyze-all [options]
 *
 * Options:
 *   --format json|csv       Output format (default: json)
 *   --scoring-model <id>    Scoring model ID (default: alpha@0.1)
 *   --from <id>             Start control/node ID (shortest-path)
 *   --to <id>               End control/node ID (shortest-path)
 *   --course <name>         Course name (analyze-course)
 *   --help                  Show help
 */
import {
  RouteAnalyzer,
  analyzeCourseLegs,
  getDifficultyCategory,
  getCourseDifficulty,
  getCourseAverageDifficulty,
  ScoringModelRegistry,
} from "@indoor-o-route-analysis/core";
import type { EventData } from "@indoor-o-route-analysis/core";
import { loadEventFile } from "./lib/loader.js";
import {
  formatJSON,
  formatShortestPathCSV,
  formatCourseCSV,
  formatAllCoursesCSV,
} from "./lib/formatter.js";
import type {
  ShortestPathResult,
  CourseResult,
  LegResult,
  AllCoursesResult,
  CourseSummary,
} from "./lib/formatter.js";

// ── Argument parsing ────────────────────────────────────────────────────────

interface CliArgs {
  file: string;
  command: "shortest-path" | "analyze-course" | "analyze-all";
  format: "json" | "csv";
  scoringModel: string;
  from?: string;
  to?: string;
  course?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // skip node and script path

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const file = args[0];
  const command = args[1];

  if (!file || !command) {
    printHelp();
    process.exit(1);
  }

  if (!["shortest-path", "analyze-course", "analyze-all"].includes(command)) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  // Parse named options
  let format: "json" | "csv" = "json";
  let scoringModel = "alpha@0.1";
  let from: string | undefined;
  let to: string | undefined;
  let course: string | undefined;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--format":
        if (next !== "json" && next !== "csv") {
          console.error(`Invalid format: ${next} (expected json or csv)`);
          process.exit(1);
        }
        format = next;
        i++;
        break;
      case "--scoring-model":
        if (!next) {
          console.error("Missing value for --scoring-model");
          process.exit(1);
        }
        scoringModel = next;
        i++;
        break;
      case "--from":
        if (!next) {
          console.error("Missing value for --from");
          process.exit(1);
        }
        from = next;
        i++;
        break;
      case "--to":
        if (!next) {
          console.error("Missing value for --to");
          process.exit(1);
        }
        to = next;
        i++;
        break;
      case "--course":
        if (!next) {
          console.error("Missing value for --course");
          process.exit(1);
        }
        course = next;
        i++;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  return {
    file,
    command: command as CliArgs["command"],
    format,
    scoringModel,
    from,
    to,
    course,
  };
}

function printHelp(): void {
  console.log(`
route-cli — Indoor orienteering route analysis CLI

Usage:
  route-cli <file> <command> [options]

Commands:
  shortest-path   Find shortest path between two controls/nodes
  analyze-course  Analyze a specific course (leg-by-leg)
  analyze-all     Analyze all courses in the event

Options:
  --format json|csv       Output format (default: json)
  --scoring-model <id>    Scoring model ID (default: alpha@0.1)
  --from <id>             Start control/node ID (shortest-path)
  --to <id>               End control/node ID (shortest-path)
  --course <name>         Course name (analyze-course)
  --help                  Show this help

Examples:
  route-cli event.json shortest-path --from S1 --to 31
  route-cli event.json analyze-course --course "Course A" --format csv
  route-cli event.xml analyze-all --format csv --scoring-model alpha@0.1
`);
}

// ── Command handlers ────────────────────────────────────────────────────────

function createAnalyzer(event: EventData, scoringModelId: string): RouteAnalyzer {
  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error("No race course data found in event");
  }

  const controls = raceCourse.controls || [];
  const vertices = raceCourse.vertices || [];
  const edges = raceCourse.edges || [];
  const polygons = raceCourse.polygons || [];
  const mapScale = raceCourse.maps?.[0]?.scale || 1000;

  const scoringModel = ScoringModelRegistry.getModelOrDefault(scoringModelId);

  return new RouteAnalyzer(controls, vertices, edges, mapScale, scoringModel, polygons);
}

function handleShortestPath(event: EventData, args: CliArgs): void {
  if (!args.from || !args.to) {
    console.error("shortest-path requires --from and --to options");
    process.exit(1);
  }

  const analyzer = createAnalyzer(event, args.scoringModel);
  const scoringModel = ScoringModelRegistry.getModelOrDefault(args.scoringModel);

  const routes = analyzer.findAlternativePathsBetweenControls(args.from, args.to, 1);

  if (routes.length === 0) {
    console.error(`No path found from ${args.from} to ${args.to}`);
    process.exit(1);
  }

  const best = routes[0];
  const category = getDifficultyCategory(best.difficulty, scoringModel);

  const result: ShortestPathResult = {
    from: args.from,
    to: args.to,
    path: best.path,
    description: best.description,
    labels: best.labels,
    distance: best.distance,
    difficulty: best.difficulty,
    difficultyCategory: category.label,
    decisionPoints: best.decisionPoints,
    alternativeEdges: best.alternativeEdges,
    totalClimb: best.totalClimb,
  };

  if (args.format === "csv") {
    process.stdout.write(formatShortestPathCSV(result));
  } else {
    console.log(formatJSON(result));
  }
}

function handleAnalyzeCourse(event: EventData, args: CliArgs): void {
  if (!args.course) {
    console.error("analyze-course requires --course option");
    process.exit(1);
  }

  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error("No race course data found in event");
  }

  const courses = raceCourse.courses || [];
  const course = courses.find(
    (c) => c.name.toLowerCase() === args.course!.toLowerCase(),
  );

  if (!course) {
    const available = courses.map((c) => c.name).join(", ");
    console.error(
      `Course "${args.course}" not found. Available courses: ${available}`,
    );
    process.exit(1);
  }

  const analyzer = createAnalyzer(event, args.scoringModel);
  const scoringModel = ScoringModelRegistry.getModelOrDefault(args.scoringModel);
  const { legs, routes } = analyzeCourseLegs(course, event, analyzer, false);

  const legDetails: LegResult[] = legs.map((leg, i) => {
    const bestRoute = routes[i]?.[0];
    const category = getDifficultyCategory(leg.difficulty, scoringModel);

    return {
      leg: leg.label,
      fromControlId: leg.fromControlId,
      toControlId: leg.toControlId,
      distance: leg.shortestDistance,
      difficulty: leg.difficulty,
      difficultyCategory: category.label,
      decisionPoints: leg.decisionPoints,
      alternativeEdges: leg.alternativeEdges,
      description: bestRoute?.description || "",
      labels: bestRoute?.labels || [],
      totalClimb: leg.totalClimb,
    };
  });

  const totalDistance = legs.reduce((sum, l) => sum + l.shortestDistance, 0);
  const maxDifficulty = getCourseDifficulty(legs, scoringModel);
  const avgDifficulty = getCourseAverageDifficulty(legs, scoringModel);
  const maxCategory = getDifficultyCategory(maxDifficulty, scoringModel);

  const result: CourseResult = {
    courseName: course.name,
    legs: legs.length,
    totalDistance,
    maxDifficulty,
    maxDifficultyCategory: maxCategory.label,
    avgDifficulty,
    targetDifficulty: course.targetDifficulty || "",
    legDetails,
  };

  if (args.format === "csv") {
    process.stdout.write(formatCourseCSV(result));
  } else {
    console.log(formatJSON(result));
  }
}

function handleAnalyzeAll(event: EventData, args: CliArgs): void {
  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error("No race course data found in event");
  }

  const courses = raceCourse.courses || [];
  if (courses.length === 0) {
    console.error("No courses found in event");
    process.exit(1);
  }

  const analyzer = createAnalyzer(event, args.scoringModel);
  const scoringModel = ScoringModelRegistry.getModelOrDefault(args.scoringModel);

  const courseSummaries: CourseSummary[] = courses.map((course) => {
    const { legs } = analyzeCourseLegs(course, event, analyzer, false);

    const totalDistance = legs.reduce((sum, l) => sum + l.shortestDistance, 0);
    const maxDifficulty = getCourseDifficulty(legs, scoringModel);
    const avgDifficulty = getCourseAverageDifficulty(legs, scoringModel);
    const maxCategory = getDifficultyCategory(maxDifficulty, scoringModel);

    return {
      courseName: course.name,
      legs: legs.length,
      totalDistance,
      maxDifficulty,
      maxDifficultyCategory: maxCategory.label,
      avgDifficulty,
      targetDifficulty: course.targetDifficulty || "",
    };
  });

  const result: AllCoursesResult = {
    eventName: event.name,
    eventDate: event.startTime?.date || "",
    courses: courseSummaries,
  };

  if (args.format === "csv") {
    process.stdout.write(formatAllCoursesCSV(result));
  } else {
    console.log(formatJSON(result));
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv);

  let event: EventData;
  try {
    event = loadEventFile(args.file);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load file: ${msg}`);
    process.exit(1);
  }

  switch (args.command) {
    case "shortest-path":
      handleShortestPath(event, args);
      break;
    case "analyze-course":
      handleAnalyzeCourse(event, args);
      break;
    case "analyze-all":
      handleAnalyzeAll(event, args);
      break;
  }
}

main();
