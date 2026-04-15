#!/usr/bin/env tsx
/**
 * Generate training app data JSON files from event JSON files.
 *
 * Usage:
 *   npx tsx index.ts [fileFilter] [inputFolder] [outputFolder] [--k <n>] [--verbose]
 *
 * Arguments:
 *   fileFilter:   Optional substring filter — only files containing this string are processed (default: all files)
 *   inputFolder:  Default: ../web/public/examples
 *   outputFolder: Default: ../../../indoor-o-training/public/examples
 *   --k <n>:      Max number of alternative paths to find per leg (default: 100)
 *   --verbose:    Print number of routes found for each leg in each course
 *
 * Examples:
 *   npx tsx index.ts 2026
 *   npx tsx index.ts "" ../web/public/examples ../../../indoor-o-training/public/examples
 *   npx tsx index.ts --k 50 --verbose
 *
 * The script processes all .json files in the input folder (excluding index.json),
 * runs route analysis on all courses, and exports training data to the output folder.
 * Output files are named with " - training" suffix (e.g., "event.json" -> "event - training.json").
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseEventFromJSON } from '@indoor-o-route-analysis/core';
import { TrainingDataIO, type TrainingCourse, type TrainingEvent } from '@indoor-o-route-analysis/core';
import { RouteAnalyzer } from '@indoor-o-route-analysis/core';
import { analyzeCourseLegs } from '@indoor-o-route-analysis/core';
import { ScoringModelRegistry } from '@indoor-o-route-analysis/core';
import type { EventData } from '@indoor-o-route-analysis/core';

// Default folders
const DEFAULT_INPUT_FOLDER = '../web/public/examples';
const DEFAULT_OUTPUT_FOLDER = '../../../indoor-o-training/public/examples';

// Parse command line arguments: separate named flags from positional args
const rawArgs = process.argv.slice(2);
const namedArgs: Record<string, string | boolean> = {};
const positionalArgs: string[] = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith('--')) {
    const key = rawArgs[i].slice(2);
    if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
      namedArgs[key] = rawArgs[i + 1];
      i++;
    } else {
      namedArgs[key] = true;
    }
  } else {
    positionalArgs.push(rawArgs[i]);
  }
}

const fileFilter = positionalArgs[0] || '';
const inputFolder = path.resolve(positionalArgs[1] || DEFAULT_INPUT_FOLDER);
const outputFolder = path.resolve(positionalArgs[2] || DEFAULT_OUTPUT_FOLDER);
const k = parseInt(String(namedArgs['k'] || '100'), 10);
const verbose = Boolean(namedArgs['verbose']);

console.log('Training Data Generator');
console.log('=======================');
console.log(`Input folder:  ${inputFolder}`);
console.log(`Output folder: ${outputFolder}`);
if (fileFilter) console.log(`File filter:   "${fileFilter}"`);
console.log(`k (max paths): ${k}`);
if (verbose) console.log('Verbose:       enabled');
console.log('');

/**
 * Process a single event file and generate training data
 */
function processEventFile(filePath: string): TrainingEvent {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const event: EventData = parseEventFromJSON(fileContent);

  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error('No race course found in event');
  }

  const courses = raceCourse.courses || [];
  if (courses.length === 0) {
    throw new Error('No courses found in event');
  }

  // Get map scale
  const map = raceCourse.maps?.[0];
  const mapScale = map?.scale || 1000;

  // Get scoring model
  const scoringModel = ScoringModelRegistry.getModelOrDefault(event.difficultyScoringModel);

  // Create route analyzer
  const routeAnalyzer = new RouteAnalyzer(
    raceCourse.controls || [],
    raceCourse.vertices || [],
    raceCourse.edges || [],
    mapScale,
    scoringModel,
    raceCourse.polygons || []
  );

  // Analyze all courses
  const analyzedCourses: TrainingCourse[] = [];

  for (const course of courses) {
    console.log(`  Analyzing course: ${course.name}`);

    // Analyze legs to get leg metadata (distances, decision points, etc.)
    const { legs } = analyzeCourseLegs(course, event, routeAnalyzer);

    // Generate course training data using findAlternativePathsBetweenControls with configured k
    const courseData = TrainingDataIO.generateCourseData(
      event,
      course,
      legs,
      routeAnalyzer,
      k,
    );

    if (verbose) {
      legs.forEach((leg, i) => {
        const routeCount = courseData.validRoutes[i]?.length ?? 0;
        console.log(`    Leg ${leg.label}: ${routeCount} route(s)`);
      });
    }

    analyzedCourses.push(courseData);
  }

  return TrainingDataIO.generateEventExport(event, analyzedCourses);
}

/**
 * Generate output filename by adding " - training" before the extension
 */
function generateOutputFilename(inputFilename: string): string {
  const ext = path.extname(inputFilename);
  const baseName = path.basename(inputFilename, ext);
  return `${baseName} - training${ext}`;
}

/**
 * Main function
 */
async function main() {
  // Check input folder exists
  if (!fs.existsSync(inputFolder)) {
    console.error(`Error: Input folder does not exist: ${inputFolder}`);
    process.exit(1);
  }

  // Create output folder if it doesn't exist
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
    console.log(`Created output folder: ${outputFolder}`);
  }

  // Get all JSON files in input folder (excluding index.json and hidden files)
  const files = fs.readdirSync(inputFolder)
    .filter(file =>
      file.endsWith('.json') &&
      file !== 'index.json' &&
      !file.startsWith('.') &&
      (!fileFilter || file.includes(fileFilter))
    );

  if (files.length === 0) {
    console.log('No JSON files found to process.');
    return;
  }

  console.log(`Found ${files.length} JSON file(s) to process.\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const inputPath = path.join(inputFolder, file);
    const outputFilename = generateOutputFilename(file);
    const outputPath = path.join(outputFolder, outputFilename);

    console.log(`Processing: ${file}`);

    try {
      const trainingData = processEventFile(inputPath);

      // Write output file
      const jsonContent = JSON.stringify(trainingData, null, 2);
      fs.writeFileSync(outputPath, jsonContent, 'utf-8');

      console.log(`  -> ${outputFilename}`);
      console.log(`     ${trainingData.courses.length} course(s) exported\n`);
      successCount++;
    } catch (error) {
      console.error(`  Error: ${(error as Error).message}\n`);
      errorCount++;
    }
  }

  console.log('Summary');
  console.log('-------');
  console.log(`Processed: ${successCount} file(s) successfully`);
  if (errorCount > 0) {
    console.log(`Errors:    ${errorCount} file(s) failed`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
