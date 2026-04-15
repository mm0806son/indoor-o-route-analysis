#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { parseEventFromJSON } from '@indoor-o-route-analysis/core';
import { RouteAnalyzer } from '@indoor-o-route-analysis/core';
import { analyzeCourseLegs } from '@indoor-o-route-analysis/core';
import { ScoringModelRegistry } from '@indoor-o-route-analysis/core';
import type { EventData } from '@indoor-o-route-analysis/core';

// Helper to get control label
function getControlLabel(controlId: string, controls: { id: string; code?: string }[]): string {
  const control = controls.find((c) => c.id === controlId);
  return control?.code || controlId;
}

const TARGET_DIFFICULTY_VALUES: Record<string, number> = {
  white: 20, yellow: 30, orange: 60, purple: 80, black: 100,
};

const DEFAULT_INPUT_FOLDER = '../web/public/examples';
const DEFAULT_OUTPUT_FOLDER = '../../analysis-output';

const inputFolder = path.resolve(process.argv[2] || DEFAULT_INPUT_FOLDER);
const outputFolder = path.resolve(process.argv[3] || DEFAULT_OUTPUT_FOLDER);
const fileFilter = process.argv[4] || '';

if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder, { recursive: true });
}

console.log('Batch Route Analysis');
console.log('====================');
console.log(`Input folder:  ${inputFolder}`);
console.log(`Output folder: ${outputFolder}`);
if (fileFilter) console.log(`File filter:   "${fileFilter}"`);
console.log('');

const files = fs.readdirSync(inputFolder).filter(f =>
  f.endsWith('.json') && f !== 'index.json' && (!fileFilter || f.includes(fileFilter))
);
const allModels = ScoringModelRegistry.getAllModels();

console.log(`Found ${files.length} files.`);
console.log(`Using ${allModels.length} scoring models: ${allModels.map(m => m.getFullId()).join(', ')}`);

// Data structures for results
interface CourseResult {
  eventDate: string;
  eventTitle: string;
  courseName: string;
  courseId: string;
  targetDifficulty: string;
  targetDifficultyValue: number | '';
  courseLength: number;
  maxDifficulties: { [modelId: string]: number };
  avgDifficulties: { [modelId: string]: number };
}

interface LegResult {
  eventDate: string;
  eventTitle: string;
  courseName: string;
  legIndex: number;
  legName: string;
  fromControl: string;
  toControl: string;
  legLength: number;
  routeDescription: string;
  difficulties: { [modelId: string]: number };
}

async function run() {
  const courseResults: CourseResult[] = [];
  const legResults: LegResult[] = [];

  for (const file of files) {
    console.log(`Analyzing ${file}...`);
    const filePath = path.join(inputFolder, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    let event: EventData;
    try {
        event = parseEventFromJSON(content);
    } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
        continue;
    }

    const raceCourse = event.raceCourses?.[0];
    if (!raceCourse) {
        console.warn(`No race course in ${file}`);
        continue;
    }

    const courses = raceCourse.courses || [];
    const controls = raceCourse.controls || [];
    const mapScale = raceCourse.maps?.[0]?.scale || 1000;

    for (const course of courses) {
      console.log(`  Course: ${course.name} (${courses.indexOf(course) + 1}/${courses.length})`);
      const courseName = course.name;
      const targetDifficulty = course.targetDifficulty || '';

      const modelMaxDifficulties: { [modelId: string]: number } = {};
      const modelAvgDifficulties: { [modelId: string]: number } = {};
      const legModelDifficulties: { [legIndex: number]: { [modelId: string]: number } } = {};

      for (const model of allModels) {
        const analyzer = new RouteAnalyzer(
            controls,
            raceCourse.vertices || [],
            raceCourse.edges || [],
            mapScale,
            model,
            raceCourse.polygons || []
        );

        // Analyze course
        const { legs } = analyzeCourseLegs(course, event, analyzer, false);
        
        // Max difficulty (course-level)
        const maxDifficulty = model.getCourseDifficulty(legs);
        modelMaxDifficulties[model.getFullId()] = maxDifficulty;

        // Avg difficulty across legs
        const avgDifficulty = legs.length > 0
            ? legs.reduce((sum, leg) => sum + leg.difficulty, 0) / legs.length
            : 0;
        modelAvgDifficulties[model.getFullId()] = avgDifficulty;

        legs.forEach((leg, index) => {
            if (!legModelDifficulties[index]) legModelDifficulties[index] = {};
            legModelDifficulties[index][model.getFullId()] = leg.difficulty;
        });
      }

      // Build leg results using first model's analyzer for leg metadata
      const metaAnalyzer = new RouteAnalyzer(
            controls,
            raceCourse.vertices || [],
            raceCourse.edges || [],
            mapScale,
            allModels[0],
            raceCourse.polygons || []
      );
      const { legs: metaLegs, routes: metaRoutes } = analyzeCourseLegs(course, event, metaAnalyzer, false);

      const courseLength = metaLegs.reduce((sum, leg) => sum + leg.shortestDistance, 0);

      courseResults.push({
          eventDate: event.startTime?.date || '',
          eventTitle: event.name || '',
          courseName,
          courseId: course.id,
          targetDifficulty,
          targetDifficultyValue: TARGET_DIFFICULTY_VALUES[targetDifficulty.toLowerCase()] ?? '',
          courseLength,
          maxDifficulties: modelMaxDifficulties,
          avgDifficulties: modelAvgDifficulties
      });

      metaLegs.forEach((leg, index) => {
          legResults.push({
              eventDate: event.startTime?.date || '',
              eventTitle: event.name || '',
              courseName,
              legIndex: index,
              legName: leg.label.replace(' → ', '-'),
              fromControl: getControlLabel(leg.fromControlId, controls),
              toControl: getControlLabel(leg.toControlId, controls),
              legLength: leg.shortestDistance,
              routeDescription: metaRoutes[index]?.[0]?.labels.join('') || '',
              difficulties: legModelDifficulties[index] || {}
          });
      });
    }
  }

  const modelIds = allModels.map(m => m.getFullId());

  // ── Course CSV ──────────────────────────────────────────────────────────────
  const courseDiffHeaders = modelIds.flatMap(id => [`${id} (max)`, `${id} (avg)`]);
  let courseCsv = `Event Date,Event Title,Course,Target Difficulty,Target Difficulty Value,Course Length (m),${courseDiffHeaders.join(',')}\n`;
  courseResults.forEach(r => {
      const diffs = modelIds.map(id => {
          const max = r.maxDifficulties[id]?.toFixed(2) || '';
          const avg = r.avgDifficulties[id]?.toFixed(2) || '';
          return `${max},${avg}`;
      }).join(',');
      courseCsv += `"${r.eventDate}","${r.eventTitle}","${r.courseName}","${r.targetDifficulty}",${r.targetDifficultyValue},${r.courseLength.toFixed(1)},${diffs}\n`;
  });
  fs.writeFileSync(path.join(outputFolder, 'course_difficulties.csv'), courseCsv);

  // ── Leg CSV ─────────────────────────────────────────────────────────────────
  let legCsv = `Event Date,Event Title,Course,Leg,From,To,Leg Length (m),Route,${modelIds.join(',')}\n`;
  legResults.forEach(r => {
      const diffs = modelIds.map(id => r.difficulties[id]?.toFixed(2) || '').join(',');
      legCsv += `"${r.eventDate}","${r.eventTitle}","${r.courseName}","${r.legName}","${r.fromControl}","${r.toControl}",${r.legLength.toFixed(1)},"${r.routeDescription}",${diffs}\n`;
  });
  fs.writeFileSync(path.join(outputFolder, 'leg_difficulties.csv'), legCsv);

  // ── Excel ────────────────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  const courseSheetData = courseResults.map(r => {
      const row: Record<string, string | number> = {
          'Event Date': r.eventDate,
          'Event Title': r.eventTitle,
          Course: r.courseName,
          'Target Difficulty': r.targetDifficulty,
          'Target Difficulty Value': r.targetDifficultyValue,
          'Course Length (m)': parseFloat(r.courseLength.toFixed(1)),
      };
      for (const id of modelIds) {
          row[`${id} (max)`] = parseFloat(r.maxDifficulties[id]?.toFixed(2) ?? '0');
          row[`${id} (avg)`] = parseFloat(r.avgDifficulties[id]?.toFixed(2) ?? '0');
      }
      return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(courseSheetData), 'course_difficulties');

  const legSheetData = legResults.map(r => {
      const row: Record<string, string | number> = {
          'Event Date': r.eventDate,
          'Event Title': r.eventTitle,
          Course: r.courseName,
          Leg: r.legName,
          From: r.fromControl,
          To: r.toControl,
          'Leg Length (m)': parseFloat(r.legLength.toFixed(1)),
          Route: r.routeDescription,
      };
      for (const id of modelIds) {
          row[id] = parseFloat(r.difficulties[id]?.toFixed(2) ?? '0');
      }
      return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(legSheetData), 'leg_difficulties');

  XLSX.writeFile(wb, path.join(outputFolder, 'difficulties.xlsx'));

  // ── JSONL ────────────────────────────────────────────────────────────────────
  const courseJsonl = courseResults.map(r => JSON.stringify({
      eventDate: r.eventDate,
      eventTitle: r.eventTitle,
      courseName: r.courseName,
      courseId: r.courseId,
      targetDifficulty: r.targetDifficulty,
      targetDifficultyValue: r.targetDifficultyValue,
      courseLengthM: parseFloat(r.courseLength.toFixed(1)),
      maxDifficulties: Object.fromEntries(
          modelIds.map(id => [id, parseFloat(r.maxDifficulties[id]?.toFixed(2) ?? '0')])
      ),
      avgDifficulties: Object.fromEntries(
          modelIds.map(id => [id, parseFloat(r.avgDifficulties[id]?.toFixed(2) ?? '0')])
      ),
  })).join('\n');
  fs.writeFileSync(path.join(outputFolder, 'course_difficulties.jsonl'), courseJsonl);

  const legJsonl = legResults.map(r => JSON.stringify({
      eventDate: r.eventDate,
      eventTitle: r.eventTitle,
      courseName: r.courseName,
      legIndex: r.legIndex,
      legName: r.legName,
      fromControl: r.fromControl,
      toControl: r.toControl,
      legLengthM: parseFloat(r.legLength.toFixed(1)),
      routeDescription: r.routeDescription,
      difficulties: Object.fromEntries(
          modelIds.map(id => [id, parseFloat(r.difficulties[id]?.toFixed(2) ?? '0')])
      ),
  })).join('\n');
  fs.writeFileSync(path.join(outputFolder, 'leg_difficulties.jsonl'), legJsonl);

  console.log(`\nDone! Output written to ${outputFolder}`);
}

run().catch(console.error);
