#!/usr/bin/env tsx

/**
 * Join runner splits with per-leg difficulty data.
 *
 * Takes splits.csv, resolves each row's course via courses.csv, then
 * looks up the leg's length and difficulty (alpha@0.1) in legs.csv.
 * Writes splits_with-difficulty.csv with extra columns appended:
 *   leg_length_m           — leg length in metres
 *   difficulty_alpha_0.1   — leg difficulty at alpha = 0.1
 *   difficulty_category    — difficulty category / colour (e.g. "Black")
 *   runningtime_seconds    — estimated pure running time: min(leg_length_m / speed, legtime_seconds)
 *   runningtime_minutes    — runningtime_seconds / 60
 *   thinkingtime_seconds   — legtime_seconds - runningtime_seconds (time spent navigating; never negative)
 *   thinkingtime_minutes   — thinkingtime_seconds / 60
 *   average_speed          — leg_length_m / legtime_seconds, in m/s
 *
 * Join path:
 *   splits(event, class) -> courses(title, course) -> legs(Event Title, Course, Leg)
 *
 * Usage:
 *   pnpm splits [legs.csv] [options]
 *
 * Options:
 *   --splits <path>    Splits CSV      (default: results/splits.csv)
 *   --courses <path>   Courses CSV     (default: results/courses.csv)
 *   -o <path>          Output CSV      (default: <splits-dir>/splits_with-difficulty.csv)
 *   --speed <m/s>      Running speed used to estimate runningtime (default: 3 m/s)
 *   --help, -h         Show this help
 *
 * If no legs.csv is given, output/route-analysis/legs.csv (from analyse-all-cli) is used.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getDifficultyCategory } from "@indoor-o-route-analysis/core";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const DEFAULT_SPEED_MPS = 3;

interface CliArgs {
  legDifficultiesFile: string | undefined;
  splitsFile: string;
  coursesFile: string;
  outputFile: string | undefined;
  speed: number;
}

function printUsage(): void {
  console.log(`Usage: pnpm splits [legs.csv] [options]

Joins splits.csv with courses.csv and legs.csv, appending the
leg length and difficulty (alpha@0.1) to each split row.

Arguments:
  legs.csv               Leg difficulty CSV. If omitted, output/route-analysis/legs.csv
                         (from analyse-all-cli) is used.

Options:
  --splits <path>    Splits CSV    (default: results/splits.csv)
  --courses <path>   Courses CSV   (default: results/courses.csv)
  -o <path>          Output CSV    (default: <splits-dir>/splits_with-difficulty.csv)
  --speed <m/s>      Running speed used to estimate runningtime (default: ${DEFAULT_SPEED_MPS} m/s)
  --help, -h         Show this help`);
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let legDifficultiesFile: string | undefined;
  let splitsFile = path.join(REPO_ROOT, "results", "splits.csv");
  let coursesFile = path.join(REPO_ROOT, "results", "courses.csv");
  let outputFile: string | undefined;
  let speed = DEFAULT_SPEED_MPS;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--splits") {
      const val = args[++i];
      if (!val) {
        console.error("Error: --splits requires a file path");
        process.exit(1);
      }
      splitsFile = val;
    } else if (arg === "--courses") {
      const val = args[++i];
      if (!val) {
        console.error("Error: --courses requires a file path");
        process.exit(1);
      }
      coursesFile = val;
    } else if (arg === "-o") {
      const val = args[++i];
      if (!val) {
        console.error("Error: -o requires a file path");
        process.exit(1);
      }
      outputFile = val;
    } else if (arg === "--speed") {
      const val = args[++i];
      const parsed = val ? Number(val) : Number.NaN;
      if (!val || !Number.isFinite(parsed) || parsed <= 0) {
        console.error("Error: --speed requires a positive number (metres/second)");
        process.exit(1);
      }
      speed = parsed;
    } else if (!arg.startsWith("-")) {
      if (!legDifficultiesFile) {
        legDifficultiesFile = arg;
      } else {
        console.error(`Error: unexpected argument "${arg}"`);
        process.exit(1);
      }
    } else {
      console.error(`Error: unknown option "${arg}"`);
      process.exit(1);
    }
  }

  return { legDifficultiesFile, splitsFile, coursesFile, outputFile, speed };
}

/** Default legs.csv written by analyse-all-cli (overwritten on every run). */
function findLatestLegDifficulties(): string | undefined {
  const legsFile = path.join(REPO_ROOT, "output", "route-analysis", "legs.csv");
  return fs.existsSync(legsFile) ? legsFile : undefined;
}

/** RFC-4180-style CSV parser: handles quoted fields, embedded commas/quotes/newlines, and CRLF. */
function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let started = false; // whether the current record has any content
  let i = content.charCodeAt(0) === 0xfeff ? 1 : 0; // skip BOM

  const pushField = (): void => {
    record.push(field);
    field = "";
    started = true;
  };
  const pushRecord = (): void => {
    pushField();
    records.push(record);
    record = [];
    started = false;
  };

  while (i < content.length) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      started = true;
      i++;
    } else if (c === ",") {
      pushField();
      i++;
    } else if (c === "\r") {
      i++;
    } else if (c === "\n") {
      pushRecord();
      i++;
    } else {
      field += c;
      started = true;
      i++;
    }
  }
  if (started || field.length > 0) pushRecord();

  const headers = records.shift() ?? [];
  return { headers, rows: records };
}

function columnIndex(headers: string[], name: string): number {
  return headers.findIndex((h) => h.trim() === name);
}

/** First matching header name from a list of candidates, or -1. */
function firstColumnIndex(headers: string[], names: string[]): number {
  for (const name of names) {
    const idx = columnIndex(headers, name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function requireFile(file: string, label: string): void {
  if (!fs.existsSync(file)) {
    console.error(`Error: ${label} not found: ${file}`);
    process.exit(1);
  }
}

function main(): void {
  const { legDifficultiesFile, splitsFile, coursesFile, outputFile, speed } = parseArgs(process.argv);

  const legFile = legDifficultiesFile
    ? path.resolve(legDifficultiesFile)
    : findLatestLegDifficulties();
  if (!legFile) {
    console.error("Error: no legs.csv given and none found at output/route-analysis/legs.csv");
    process.exit(1);
  }
  const splitsPath = path.resolve(splitsFile);
  const coursesPath = path.resolve(coursesFile);
  requireFile(legFile, "leg difficulties file");
  requireFile(splitsPath, "splits file");
  requireFile(coursesPath, "courses file");

  const outputPath = outputFile
    ? path.resolve(outputFile)
    : path.join(path.dirname(splitsPath), "splits_with-difficulty.csv");

  console.log(`Splits:          ${splitsPath}`);
  console.log(`Courses:         ${coursesPath}`);
  console.log(`Leg difficulty:  ${legFile}`);
  console.log(`Speed:           ${speed} m/s`);

  // --- Build course lookup: (event|class) -> { title, course } ---
  const courses = parseCsv(fs.readFileSync(coursesPath, "utf-8"));
  const cEvent = columnIndex(courses.headers, "event");
  const cClass = columnIndex(courses.headers, "class");
  const cTitle = columnIndex(courses.headers, "title");
  const cCourse = columnIndex(courses.headers, "course");
  if ([cEvent, cClass, cTitle, cCourse].includes(-1)) {
    console.error("Error: courses.csv must have columns: event, class, title, course");
    process.exit(1);
  }
  const courseByEventClass = new Map<string, { title: string; course: string }>();
  for (const row of courses.rows) {
    const key = `${row[cEvent]?.trim()}|${row[cClass]?.trim()}`;
    courseByEventClass.set(key, {
      title: row[cTitle]?.trim() ?? "",
      course: row[cCourse]?.trim() ?? "",
    });
  }

  // --- Build leg difficulty lookup: (title|course|leg) -> { legLength, alpha } ---
  const legs = parseCsv(fs.readFileSync(legFile, "utf-8"));
  const lTitle = columnIndex(legs.headers, "Event Title");
  const lCourse = columnIndex(legs.headers, "Course");
  const lLeg = columnIndex(legs.headers, "Leg");
  // "Leg Length (m)" in older exports, "Shortest Length (m)" in newer ones.
  const lLength = firstColumnIndex(legs.headers, ["Leg Length (m)", "Shortest Length (m)"]);
  const lAlpha = columnIndex(legs.headers, "alpha@0.1");
  if ([lTitle, lCourse, lLeg, lLength, lAlpha].includes(-1)) {
    console.error(
      "Error: legs.csv must have columns: Event Title, Course, Leg, " +
        "Leg Length (m) (or Shortest Length (m)), alpha@0.1",
    );
    process.exit(1);
  }
  const legByKey = new Map<string, { legLength: string; alpha: string }>();
  for (const row of legs.rows) {
    const key = `${row[lTitle]?.trim()}|${row[lCourse]?.trim()}|${row[lLeg]?.trim()}`;
    legByKey.set(key, {
      legLength: row[lLength]?.trim() ?? "",
      alpha: row[lAlpha]?.trim() ?? "",
    });
  }

  // --- Join splits ---
  const splits = parseCsv(fs.readFileSync(splitsPath, "utf-8"));
  const sEvent = columnIndex(splits.headers, "event");
  const sClass = columnIndex(splits.headers, "class");
  const sLeg = columnIndex(splits.headers, "leg");
  const sLegtimeSeconds = columnIndex(splits.headers, "legtime_seconds");
  if ([sEvent, sClass, sLeg, sLegtimeSeconds].includes(-1)) {
    console.error("Error: splits.csv must have columns: event, class, leg, legtime_seconds");
    process.exit(1);
  }

  const outLines: string[] = [
    [
      ...splits.headers,
      "leg_length_m",
      "difficulty_alpha_0.1",
      "difficulty_category",
      "runningtime_seconds",
      "runningtime_minutes",
      "thinkingtime_seconds",
      "thinkingtime_minutes",
      "average_speed",
    ]
      .map(escapeCsvField)
      .join(","),
  ];

  let matched = 0;
  let unmatched = 0;
  const missingCourse = new Set<string>();
  const missingLeg = new Set<string>();

  for (const row of splits.rows) {
    const event = row[sEvent]?.trim() ?? "";
    const cls = row[sClass]?.trim() ?? "";
    const leg = row[sLeg]?.trim() ?? "";

    const course = courseByEventClass.get(`${event}|${cls}`);
    let legLength = "";
    let alpha = "";
    if (!course) {
      missingCourse.add(`${event}|${cls}`);
      unmatched++;
    } else {
      const diff = legByKey.get(`${course.title}|${course.course}|${leg}`);
      if (diff) {
        legLength = diff.legLength;
        alpha = diff.alpha;
        matched++;
      } else {
        missingLeg.add(`${course.title}|${course.course}|${leg}`);
        unmatched++;
      }
    }

    // Difficulty category (colour) derived from the alpha score, e.g. "Black".
    let category = "";
    if (alpha !== "") {
      const alphaNum = Number(alpha);
      if (Number.isFinite(alphaNum)) category = getDifficultyCategory(alphaNum).label;
    }

    // runningtime = estimated time to cover leg_length_m at the given speed;
    // thinkingtime = remainder of legtime (navigation/route-choice time).
    let runningtimeSeconds = "";
    let runningtimeMinutes = "";
    let thinkingtimeSeconds = "";
    let thinkingtimeMinutes = "";
    let averageSpeed = "";
    const legLengthNum = legLength !== "" ? Number(legLength) : Number.NaN;
    const legtimeSecondsNum = Number(row[sLegtimeSeconds]);
    if (Number.isFinite(legLengthNum) && Number.isFinite(legtimeSecondsNum)) {
      const runSeconds = Math.min(legLengthNum / speed, legtimeSecondsNum);
      const thinkSeconds = legtimeSecondsNum - runSeconds;
      runningtimeSeconds = runSeconds.toFixed(1);
      runningtimeMinutes = (runSeconds / 60).toFixed(3);
      thinkingtimeSeconds = thinkSeconds.toFixed(1);
      thinkingtimeMinutes = (thinkSeconds / 60).toFixed(3);
      if (legtimeSecondsNum > 0) averageSpeed = (legLengthNum / legtimeSecondsNum).toFixed(3);
    }

    outLines.push(
      [
        ...row,
        legLength,
        alpha,
        category,
        runningtimeSeconds,
        runningtimeMinutes,
        thinkingtimeSeconds,
        thinkingtimeMinutes,
        averageSpeed,
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }

  const dir = path.dirname(outputPath);
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, `${outLines.join("\n")}\n`, "utf-8");

  console.log(`\nWritten: ${outputPath}`);
  console.log(`Rows:    ${splits.rows.length}  (matched ${matched}, unmatched ${unmatched})`);
  if (missingCourse.size > 0) {
    console.log(`\nNo course match for (event|class):`);
    for (const key of missingCourse) console.log(`  ${key}`);
  }
  if (missingLeg.size > 0) {
    console.log(`\nNo leg-difficulty match for ${missingLeg.size} (title|course|leg) combination(s), e.g.:`);
    for (const key of [...missingLeg].slice(0, 10)) console.log(`  ${key}`);
  }
}

main();
