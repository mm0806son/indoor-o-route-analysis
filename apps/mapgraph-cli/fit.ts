#!/usr/bin/env tsx
/**
 * Fits extraction parameters against the hand-drawn corpus.
 *
 * Usage:
 *   pnpm --filter mapgraph-cli fit <corpus-manifest.json> [--events 8] [--stage graph|pixel|both]
 *
 * The parameters split by cost. Pixel-stage parameters change classification and
 * the free-space mask, so every candidate needs the whole pipeline re-run — about
 * four seconds per event. Graph-stage parameters only reshape an already-traced
 * skeleton. Sweeping them together would multiply those costs; sweeping them in
 * stages keeps the search on a four-core box down to minutes.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  DEFAULT_EXTRACTION_PARAMS,
  extractMapGraph,
  type ExtractionParams,
  type MapData,
  type Node,
} from "@indoor-o-route-analysis/core";

import { readPpm } from "./lib/ppm";

interface CorpusEntry {
  name: string;
  json: string;
  ppms: string[];
  mapData: MapData;
}

interface Reference {
  nodes: { id: string; x: number; y: number }[];
  edgeCount: number;
  polygonCount: number;
}

function loadReference(path: string): Reference {
  const event = JSON.parse(readFileSync(path, "utf8"));
  const race = event.raceCourses?.[0] ?? {};
  const nodes: Reference["nodes"] = [];

  for (const v of race.vertices ?? []) nodes.push({ id: v.id, x: v.x, y: v.y });
  for (const c of race.controls ?? []) {
    if (c.mapPosition) nodes.push({ id: c.id, x: c.mapPosition.x, y: c.mapPosition.y });
  }

  return {
    nodes,
    edgeCount: (race.edges ?? []).length,
    polygonCount: (race.polygons ?? []).length,
  };
}

/** Percentile of a numeric sample, linear interpolation between ranks. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

function nearestDistances(
  from: { x: number; y: number }[],
  to: { x: number; y: number }[],
): number[] {
  if (to.length === 0) return from.map(() => Number.POSITIVE_INFINITY);
  return from.map((a) => {
    let best = Number.POSITIVE_INFINITY;
    for (const b of to) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < best) best = d;
    }
    return best;
  });
}

export interface EventScore {
  name: string;
  /** p90 distance from a hand-drawn node to the nearest generated one, in metres. */
  coverageP90: number;
  /** p90 distance from a generated node to the nearest hand-drawn one, in metres. */
  precisionP90: number;
  meanDegree: number;
  nodeRatio: number;
  panelRatio: number;
}

function scoreEvent(entry: CorpusEntry, reference: Reference, params: ExtractionParams): EventScore {
  const pages = entry.ppms.map((path, index) => ({ index, image: readPpm(path) }));
  // `pageCount` counts map pages, which is not the same as physical PDF pages:
  // a two-page-wide document is often composited onto one sheet. When the render
  // produced fewer images than the layout expects, that one image is the whole
  // document and has to be measured against the document width, not a page's.
  const declared = entry.mapData.pageCount ?? 1;
  const imageSpans = pages.length < declared ? "document" : "page";
  const result = extractMapGraph({ pages, mapData: entry.mapData, params, imageSpans });

  const scale = entry.mapData.scale ?? 1;
  const toMetres = (eventUnits: number) => eventUnits * scale * 0.001;

  const generated: Node[] = result.vertices;
  const coverage = nearestDistances(reference.nodes, generated).map(toMetres);
  const precision = nearestDistances(generated, reference.nodes).map(toMetres);

  const degree = new Map<string, number>();
  for (const e of result.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const degrees = [...degree.values()];

  return {
    name: entry.name,
    coverageP90: percentile(coverage, 0.9),
    precisionP90: percentile(precision, 0.9),
    meanDegree: degrees.length ? degrees.reduce((s, d) => s + d, 0) / degrees.length : 0,
    nodeRatio: generated.length / Math.max(1, reference.nodes.length),
    panelRatio: result.panels.length / Math.max(1, reference.polygonCount),
  };
}

/**
 * Combines the per-event scores into one number to minimise.
 *
 * Coverage and precision are stated as a pair on purpose: coverage alone is
 * satisfied by a generator that carpets every walkable pixel, and precision
 * alone by one that emits a single well-placed node. Degree and node count enter
 * as penalties rather than terms, so a run only pays for them once it leaves the
 * band the hand-drawn corpus occupies.
 */
export function objective(scores: EventScore[]): number {
  let total = 0;
  for (const s of scores) {
    // An event that produces no graph is a defect, not a bad score. Folding it
    // in as a large constant made one broken event contribute 167 of a 191-point
    // objective, which flattened the search until every parameter looked
    // irrelevant. Fitting on top of a broken event fits noise, so it stops here.
    if (!Number.isFinite(s.coverageP90) || !Number.isFinite(s.precisionP90)) {
      throw new Error(
        `${s.name} produced no usable graph. Fix the extraction for that event before fitting; ` +
          `scoring it as "very bad" would let it dominate the objective.`,
      );
    }

    total += s.coverageP90 + s.precisionP90;
    if (s.meanDegree < 2.0) total += (2.0 - s.meanDegree) * 20;
    if (s.meanDegree > 2.4) total += (s.meanDegree - 2.4) * 20;

    // Log-scaled so a tenfold over-generation does not swamp the distance terms
    // the way a linear penalty does.
    if (s.nodeRatio < 0.5) total += Math.log2(0.5 / s.nodeRatio) * 8;
    if (s.nodeRatio > 2.5) total += Math.log2(s.nodeRatio / 2.5) * 8;
  }
  return total / Math.max(1, scores.length);
}

const GRAPH_STAGE: (keyof ExtractionParams)[] = [
  "junctionMergeRadiusMeters",
  "clearanceMergeFactor",
  "simplifyToleranceMeters",
  "targetNodeSpacingMeters",
  "minBranchLengthMeters",
];

const PIXEL_STAGE: (keyof ExtractionParams)[] = [
  "closingRadiusMeters",
  "openingRadiusMeters",
  "maxFillHoleAreaSqM",
  "minPanelAreaSqM",
];

const CANDIDATES: Partial<Record<keyof ExtractionParams, number[]>> = {
  junctionMergeRadiusMeters: [1.0, 1.5, 2.0, 3.0],
  clearanceMergeFactor: [0, 0.8, 1.5, 2.2],
  simplifyToleranceMeters: [0.3, 0.5, 0.8, 1.2],
  targetNodeSpacingMeters: [4, 6, 8, 12],
  minBranchLengthMeters: [2, 3, 5, 8],
  closingRadiusMeters: [0.2, 0.3, 0.5],
  openingRadiusMeters: [0.2, 0.4, 0.6],
  maxFillHoleAreaSqM: [2, 4, 8],
  minPanelAreaSqM: [8, 15, 30],
};

function main(): void {
  const argv = process.argv.slice(2);
  const manifestPath = argv.find((a) => !a.startsWith("--"));
  if (!manifestPath) {
    console.error("Usage: fit <corpus-manifest.json> [--events N] [--stage graph|pixel|both]");
    process.exit(1);
  }
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const limit = Number(flag("events") ?? "8");
  const stage = flag("stage") ?? "both";

  const root = dirname(resolve(manifestPath));
  const manifest: CorpusEntry[] = JSON.parse(readFileSync(manifestPath, "utf8")).map(
    (e: CorpusEntry) => ({ ...e, ppms: e.ppms.map((p) => resolve(root, "..", p)) }),
  );
  // Single-page events only. On a composited multi-page document the harness
  // cannot currently line the render up with event space in y - verified by
  // comparing bounding boxes - so those events would contribute a large constant
  // error that swamps every parameter's effect. Restricting the corpus keeps the
  // objective measuring what it claims to. 19 of the 23 events qualify.
  const usable = manifest.filter((e) => (e.mapData.pageCount ?? 1) === 1);
  // Spread the sample rather than taking a prefix: the files are date-ordered and
  // consecutive events share a venue and a mapper.
  const step = Math.max(1, Math.floor(usable.length / limit));
  const sample = usable.filter((_, i) => i % step === 0).slice(0, limit);
  const references = new Map(sample.map((e) => [e.name, loadReference(e.json)]));

  console.log(`fitting on ${sample.length} events: ${sample.map((e) => e.name.slice(0, 18)).join(", ")}\n`);

  let best = { ...DEFAULT_EXTRACTION_PARAMS };
  const evaluate = (params: ExtractionParams): { value: number; scores: EventScore[] } => {
    const scores = sample.map((e) => scoreEvent(e, references.get(e.name) as Reference, params));
    return { value: objective(scores), scores };
  };

  let current = evaluate(best);
  console.log(`baseline objective ${current.value.toFixed(3)}`);

  const keys = stage === "graph" ? GRAPH_STAGE : stage === "pixel" ? PIXEL_STAGE : [...GRAPH_STAGE, ...PIXEL_STAGE];

  // Coordinate descent. A full grid over nine parameters is out of reach on this
  // hardware; sweeping one axis at a time converges in a handful of passes and
  // every step is a measured improvement rather than an interpolation.
  for (let pass = 0; pass < 2; pass++) {
    let improvedThisPass = false;

    for (const key of keys) {
      const options = CANDIDATES[key];
      if (!options) continue;

      for (const value of options) {
        if (best[key] === value) continue;
        const trial = { ...best, [key]: value };
        const scored = evaluate(trial);
        const mark = scored.value < current.value ? "*" : " ";
        console.log(`  ${mark} ${key} = ${value}  ->  ${scored.value.toFixed(3)}`);
        if (scored.value < current.value) {
          best = trial;
          current = scored;
          improvedThisPass = true;
        }
      }
    }

    console.log(`pass ${pass + 1} done, objective ${current.value.toFixed(3)}`);
    if (!improvedThisPass) break;
  }

  console.log("\nfitted parameters:");
  for (const key of keys) console.log(`  ${key}: ${best[key]}`);

  console.log("\nper-event at the fitted parameters:");
  console.log(`  ${"event".padEnd(38)} ${"cover".padStart(6)} ${"prec".padStart(6)} ${"deg".padStart(5)} ${"nodes".padStart(6)}`);
  for (const s of current.scores) {
    console.log(
      `  ${s.name.slice(0, 38).padEnd(38)} ${s.coverageP90.toFixed(1).padStart(6)} ${s.precisionP90.toFixed(1).padStart(6)} ${s.meanDegree.toFixed(2).padStart(5)} ${s.nodeRatio.toFixed(2).padStart(6)}`,
    );
  }
}

main();
