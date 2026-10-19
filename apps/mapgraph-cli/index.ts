#!/usr/bin/env tsx
/**
 * Generates a routing graph from an indoor orienteering map raster.
 *
 * Usage:
 *   pnpm mapgraph <page.ppm> [--scale 500] [--width-mm 414] [--out graph.json]
 *                            [--spacing 6] [--merge 1.5]
 *
 * Working resolution is set when rasterising (pdftoppm -r), not here.
 *
 * Convert a map document to PPM first:
 *   pdftoppm -r 200 -f 1 -l 1 map.pdf page
 */

import { readFileSync, writeFileSync } from "node:fs";

import { extractMapGraph, type Control, type MapData } from "@indoor-o-route-analysis/core";

import { readPpm } from "./lib/ppm";

interface Options {
  input: string;
  scale: number;
  widthMm: number;
  out?: string;
  spacing?: number;
  merge?: number;
  minPanel?: number;
  branch?: number;
  clearance?: number;
  opening?: number;
  event?: string;
  page?: number;
  lut?: boolean;
  noBarriers?: boolean;
  snap?: number;
  pairSim?: number;
  dumpMask?: string;
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  const flags = new Map<string, string>();

  // Boolean flags take no value. Without this the generic branch swallows the
  // next argument, so `--lut --out graph.json` silently loses the output path.
  const BOOLEAN_FLAGS = new Set(["lut", "no-barriers"]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) flags.set(name, "true");
    else flags.set(name, argv[++i] ?? "");
  }

  if (positional.length === 0) {
    console.error("Usage: mapgraph <page.ppm> [--scale 500] [--width-mm 414] [--out graph.json]");
    process.exit(1);
  }

  const num = (key: string): number | undefined => {
    const raw = flags.get(key);
    return raw === undefined ? undefined : Number(raw);
  };

  return {
    input: positional[0],
    scale: num("scale") ?? 500,
    widthMm: num("width-mm") ?? 297,
    out: flags.get("out"),
    spacing: num("spacing"),
    merge: num("merge"),
    minPanel: num("min-panel"),
    branch: num("branch"),
    clearance: num("clearance"),
    opening: num("opening"),
    event: flags.get("event"),
    page: num("page"),
    lut: argv.includes("--lut"),
    noBarriers: argv.includes("--no-barriers"),
    snap: num("snap"),
    pairSim: num("pair-sim"),
    dumpMask: flags.get("dump-mask"),
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const image = readPpm(options.input);

  // Taking the map metadata from a real event exercises the transforms the app
  // actually uses - negative origins, inverted axes, per-page manual calibration
  // - rather than the idealised one the flags describe.
  let mapData: MapData;
  let reference: { x: number; y: number }[] = [];
  let controls: Control[] = [];
  let existingVertexIds: string[] = [];
  if (options.event) {
    const event = JSON.parse(readFileSync(options.event, "utf8"));
    const race = event.raceCourses?.[0] ?? {};
    mapData = race.maps?.[0];
    reference = (race.vertices ?? []).map((v: { x: number; y: number }) => ({ x: v.x, y: v.y }));
    controls = race.controls ?? [];
    existingVertexIds = (race.vertices ?? []).map((v: { id: string }) => v.id);
  } else {
    const heightMm = (image.height / image.width) * options.widthMm;
    mapData = {
      scale: options.scale,
      image: { width: options.widthMm, height: heightMm },
      mapPositionTopLeft: { x: 0, y: 0 },
      mapPositionBottomRight: { x: options.widthMm, y: heightMm },
      layout: "pages",
    };
  }

  const started = Date.now();
  const declaredPages = mapData?.pageCount ?? 1;
  const result = extractMapGraph({
    onFreeSpace: options.dumpMask
      ? (pageIndex, mask) => {
          // Plain PGM: no encoder needed, and any image viewer opens it.
          const header = Buffer.from(`P5\n${mask.width} ${mask.height}\n255\n`, "ascii");
          const body = Buffer.from(mask.data.map((v) => (v ? 255 : 0)));
          writeFileSync(`${options.dumpMask}-${pageIndex}.pgm`, Buffer.concat([header, body]));
          console.log(`mask         ${options.dumpMask}-${pageIndex}.pgm`);
        }
      : undefined,
    controls,
    existingVertexIds,
    classifier: options.lut ? "lut" : "palette",
    imageSpans: declaredPages > 1 ? "document" : "page",
    pages: [{ index: options.page ?? 0, image }],
    mapData,
    params: {
      ...(options.spacing !== undefined ? { targetNodeSpacingMeters: options.spacing } : {}),
      ...(options.merge !== undefined ? { junctionMergeRadiusMeters: options.merge } : {}),
      ...(options.minPanel !== undefined ? { minPanelAreaSqM: options.minPanel } : {}),
      ...(options.branch !== undefined ? { minBranchLengthMeters: options.branch } : {}),
      ...(options.clearance !== undefined ? { clearanceMergeFactor: options.clearance } : {}),
      ...(options.opening !== undefined ? { openingRadiusMeters: options.opening } : {}),
      ...(options.noBarriers ? { barriersBlock: false } : {}),
      ...(options.snap !== undefined ? { maxControlSnapMeters: options.snap } : {}),
      ...(options.pairSim !== undefined ? { stairPairMinSimilarity: options.pairSim } : {}),
    },
  });
  const elapsed = Date.now() - started;

  const degrees = new Map<string, number>();
  for (const edge of result.edges) {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  const degreeValues = [...degrees.values()];
  const meanDegree = degreeValues.reduce((s, d) => s + d, 0) / (degreeValues.length || 1);

  console.log(`image        ${image.width} x ${image.height} px`);
  for (const page of result.roleFractions) {
    const parts = Object.entries(page.fractions)
      .filter(([, f]) => f > 0.0005)
      .map(([name, f]) => `${name} ${(f * 100).toFixed(2)}%`);
    console.log(`roles        ${parts.join("  ")}`);
  }
  console.log(`panels       ${result.panels.length}`);
  console.log(`vertices     ${result.vertices.length}`);
  console.log(`edges        ${result.edges.length}`);
  console.log(`mean degree  ${meanDegree.toFixed(2)}`);
  console.log(`degree 1     ${degreeValues.filter((d) => d === 1).length}`);
  console.log(`degree 2     ${degreeValues.filter((d) => d === 2).length}`);
  console.log(`degree 3+    ${degreeValues.filter((d) => d >= 3).length}`);
  const attachedControls = new Set<string>();
  const controlIds = new Set(controls.map((c) => c.id));
  for (const e of result.edges) {
    if (controlIds.has(e.from)) attachedControls.add(e.from);
    if (controlIds.has(e.to)) attachedControls.add(e.to);
  }
  if (controls.length > 0) {
    console.log(`controls     ${attachedControls.size} / ${controls.length} attached`);
  }
  console.log(`stairs       ${result.stairs.length}  areas ${result.stairs.map((s) => s.areaSqM.toFixed(1)).join(" ")}`);
  console.log(`panel areas  ${result.panels.map((p) => Math.round(p.areaSqM)).join(" ")} m2`);
  const unmatched = result.unmatchedColours
    .map(({ rgb, fraction }) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")} ${(fraction * 100).toFixed(2)}%`)
    .join("  ");
  if (unmatched) console.log(`unmatched    ${unmatched}`);
  const bbox = (pts: { x: number; y: number }[]) =>
    pts.length === 0
      ? "(none)"
      : `x[${Math.min(...pts.map((p) => p.x)).toFixed(0)},${Math.max(...pts.map((p) => p.x)).toFixed(0)}] ` +
        `y[${Math.min(...pts.map((p) => p.y)).toFixed(0)},${Math.max(...pts.map((p) => p.y)).toFixed(0)}]`;
  console.log(`gen bbox     ${bbox(result.vertices)}`);
  if (reference.length > 0) console.log(`hand bbox    ${bbox(reference)}`);
  console.log(`elapsed      ${elapsed} ms`);

  for (const diagnostic of result.diagnostics) {
    console.log(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
  }

  if (options.out) {
    writeFileSync(
      options.out,
      JSON.stringify(
        {
          vertices: result.vertices,
          edges: result.edges,
          panels: result.panels,
          stairs: result.stairs,
          diagnostics: result.diagnostics,
        },
        null,
        2,
      ),
    );
    console.log(`written      ${options.out}`);
  }
}

main();
