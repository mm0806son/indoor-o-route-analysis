/**
 * Orchestration for map graph extraction.
 *
 * See docs/superpowers/specs/2026-07-27-map-graph-extraction-design.md for the
 * reasoning behind the stage order and the parameter defaults.
 */

import { attachControls, nearestFreePixel } from "./attach-controls";
import { traceOuterContour } from "./contour";
import { buildFreeSpace, splitIntoPanels } from "./free-space";
import { clearanceTransform, cropToContent } from "./morphology";
import { classifyPixels, classifyPixelsWithLut, type ColourLut } from "./palette";
import { INDOOR_COLOUR_LUT } from "./indoor-colour-lut.generated";
import { INDOOR_KARTNORM_PALETTE } from "./indoor-kartnorm.generated";
import { skeletonize } from "./skeleton";
import {
  dropOrphanNodes,
  materializeChainNodes,
  mergeNearbyNodes,
  pruneShortDeadEnds,
  simplifyEdges,
} from "./simplify";
import { attachStair, distanceToGraph, findStairBlobs, stairAbutsPanel, type DetectedStair } from "./stairs";
import { extractGlyph, glyphSimilarity, pairStairsByGlyph, type GlyphSignature } from "./pair-stairs";
import { hasLineOfSight, longestBlockedRun } from "./line-of-sight";
import { snapPointToGraph } from "./snap";
import { createIdAllocator, createPixelToEvent, tracedGraphToEvent } from "./to-event";
import { traceSkeleton } from "./trace";
import { ROLE_NAMES, roleCode } from "./types";
import type { Control } from "../models/control";
import type { Edge, Node } from "../models/graph";
import type { MapData } from "../models/map";
import type {
  BitMask,
  Diagnostic,
  ExtractionParams,
  PageImage,
  PaletteEntry,
  PanelCandidate,
  StairCandidate,
  TracedGraph,
} from "./types";

export interface ExtractionInput {
  pages: PageImage[];
  mapData?: MapData;
  /** Existing controls; each is snapped onto the generated graph. */
  controls?: Control[];
  /** Existing vertex ids, so generated ids cannot collide. */
  existingVertexIds?: string[];
  palette?: readonly PaletteEntry[];
  /**
   * How pixels are assigned a role.
   *
   * "palette" measures perceptual distance to the listed kartnorm inks, which is
   * exact on a clean render and starts guessing once a scan has moved the
   * colours. "lut" reads a table learned from degraded renders of the corpus,
   * which is what a scan actually looks like.
   */
  classifier?: "palette" | "lut";
  lut?: ColourLut;
  params?: Partial<ExtractionParams>;
  /**
   * Receives each page's free-space mask.
   *
   * The mask is the input every later stage depends on, and when a control
   * cannot reach the graph the answer is almost always visible in it rather than
   * in the graph. Exposing it costs nothing and saves reconstructing it.
   */
  onFreeSpace?(pageIndex: number, mask: BitMask): void;
  /** Page boundary offsets, when pages were composited into one image. */
  seams?: { axis: "x" | "y"; offsets: number[] };
  /**
   * Whether each `PageImage` covers one page or the whole composited document.
   * Defaults to one page, which is the only form that works with per-page manual
   * transforms.
   */
  imageSpans?: "page" | "document";
}

export interface ExtractionResult {
  vertices: Node[];
  edges: Edge[];
  panels: PanelCandidate[];
  stairs: StairCandidate[];
  diagnostics: Diagnostic[];
  /** Per-page pixel role shares, for the review UI. */
  roleFractions: { pageIndex: number; fractions: Record<string, number> }[];
  /**
   * Dominant colours the palette did not match, per page, most frequent first.
   * Always reported, not only when the mismatch diagnostic trips: a map can use
   * a handful of off-norm inks without crossing any threshold, and those inks
   * are exactly what a user needs to see to extend the role table.
   */
  unmatchedColours: { pageIndex: number; rgb: [number, number, number]; fraction: number }[];
}

import { DEFAULT_EXTRACTION_PARAMS } from "./types";

export function extractMapGraph(input: ExtractionInput): ExtractionResult {
  const params = { ...DEFAULT_EXTRACTION_PARAMS, ...input.params };
  const palette = input.palette ?? INDOOR_KARTNORM_PALETTE;

  const controlIds = (input.controls ?? []).map((c) => c.id);
  const ids = createIdAllocator([...(input.existingVertexIds ?? []), ...controlIds]);

  const vertices: Node[] = [];
  const edges: Edge[] = [];
  const panels: PanelCandidate[] = [];
  const stairs: StairCandidate[] = [];
  const diagnostics: Diagnostic[] = [];
  const roleFractions: ExtractionResult["roleFractions"] = [];
  const unmatchedColours: ExtractionResult["unmatchedColours"] = [];

  let panelCounter = 0;
  const accountedControls = new Set<string>();
  const pageGlyphs: { glyphs: Map<number, GlyphSignature | undefined>; panels: Map<number, number> }[] = [];
  // Serial pairs joined by a within-page stair (a mezzanine drawn in place).
  const bridges: { a: number; b: number }[] = [];

  for (const page of input.pages) {
    const classified =
      (input.classifier ?? "palette") === "lut"
        ? classifyPixelsWithLut(page.image, input.lut ?? INDOOR_COLOUR_LUT, palette)
        : classifyPixels(page.image, palette, {
            deltaEAccept: params.deltaEAccept,
            deltaEMarginAccept: params.deltaEMarginAccept,
            deltaEMarginRatio: params.deltaEMarginRatio,
          });

    const fractions: Record<string, number> = {};
    ROLE_NAMES.forEach((name, index) => {
      fractions[name] = classified.roleFractions[index];
    });
    roleFractions.push({ pageIndex: page.index, fractions });
    for (const entry of classified.unmatched) {
      unmatchedColours.push({ pageIndex: page.index, ...entry });
    }

    const mapping = createPixelToEvent(
      input.mapData,
      page.index,
      page.image.width,
      input.imageSpans ?? "page",
    );
    const metresPerPixel = mapping.metresPerPixel;
    const toPx = (metres: number) => metres / metresPerPixel;
    const sqMetresToPx = (sqm: number) => sqm / (metresPerPixel * metresPerPixel);

    diagnosePalette(classified.roleFractions, classified.unmatched, page.index, diagnostics);

    // Barrier tape and course overprint are the same violet ink, so a map that
    // still carries its courses has them blocking corridors alongside the real
    // barriers. Blocking is the safe default - a competitor cannot cross tape -
    // but the user needs to know why their corridors are cut.
    const barrierShare = classified.roleFractions[roleCode("barrier")];
    if (barrierShare > 0.004) {
      diagnostics.push({
        severity: "info",
        code: "course-overprint-blocks",
        message:
          `${(barrierShare * 100).toFixed(2)}% of pixels are the violet barrier ink, which blocks. ` +
          `Course overprint uses the same ink and cannot be told apart by colour, so if this map ` +
          `still carries its courses those lines are cutting corridors too. Use a course-free base ` +
          `map if the graph looks over-fragmented.`,
        where: { pageIndex: page.index },
      });
    }

    const freeSpace = buildFreeSpace(classified.classMap, classified.width, classified.height, {
      closingRadiusPx: toPx(params.closingRadiusMeters),
      openingRadiusPx: toPx(params.openingRadiusMeters),
      barriersBlock: params.barriersBlock,
      maxFillHoleAreaPx: sqMetresToPx(params.maxFillHoleAreaSqM),
      minComponentAreaPx: sqMetresToPx(params.minPanelAreaSqM),
      seams: input.seams,
    });

    input.onFreeSpace?.(page.index, freeSpace);

    const panelMasks = splitIntoPanels(freeSpace, sqMetresToPx(params.minPanelAreaSqM));

    // Controls are placed in pixel space once per page, then assigned to the
    // panel that actually contains them.
    const controlPixels = (input.controls ?? [])
      .filter((c) => c.mapPosition)
      .map((control) => ({ control, ...mapping.toPixel(control.mapPosition) }));

    // Panel graphs are built first, then stairs are assigned, then controls.
    // Stairs need every panel's graph to exist before ownership can be decided,
    // so the panel loop cannot do all three in one pass.
    const built: { panelIndex: number; panel: (typeof panelMasks)[number]; graph: TracedGraph }[] = [];

    for (const panel of panelMasks) {
      const panelIndex = panelCounter++;

      // Thinning rescans its whole input every pass, so it runs on the panel's
      // bounding box rather than the full page; coordinates are shifted back
      // immediately afterwards.
      const cropped = cropToContent(panel.mask);
      if (!cropped) continue;

      // Clearance drives how hard nodes merge: tight in corridors, loose in halls.
      const clearance = clearanceTransform(cropped.mask);
      let graph = traceSkeleton(skeletonize(cropped.mask), page.index, panelIndex, clearance);
      if (graph.edges.length === 0) continue;

      graph = {
        ...graph,
        nodes: graph.nodes.map((n) => ({
          ...n,
          px: n.px + cropped.offsetX,
          py: n.py + cropped.offsetY,
        })),
        edges: graph.edges.map((e) => ({
          ...e,
          polyline: e.polyline.map((p) => ({
            px: p.px + cropped.offsetX,
            py: p.py + cropped.offsetY,
          })),
        })),
      };

      // Junction clusters must collapse before pruning, so that a dead-end
      // edge's length is the real branch length rather than a fragment of it.
      graph = mergeNearbyNodes(
        graph,
        toPx(params.junctionMergeRadiusMeters),
        params.clearanceMergeFactor,
        freeSpace,
        Math.max(2, toPx(params.maxWallCrossingMeters)),
      );
      graph = pruneShortDeadEnds(
        graph,
        toPx(params.minBranchLengthMeters),
        params.clearanceMergeFactor,
      );
      graph = simplifyEdges(
        graph,
        toPx(params.simplifyToleranceMeters),
        freeSpace,
        Math.max(2, toPx(params.maxWallCrossingMeters)),
      );
      graph = materializeChainNodes(
        graph,
        toPx(params.targetNodeSpacingMeters),
        params.clearanceMergeFactor,
      );
      graph = dropOrphanNodes(graph);

      built.push({ panelIndex, panel, graph });
    }

    // Each stair belongs to exactly one panel: the one whose graph it is nearest
    // to. Attaching to every panel within reach would duplicate the same
    // physical stair, since floor panels are millimetres apart on paper.
    const stairsByPanel = new Map<number, DetectedStair[]>();
    const glyphPanel = new Map<number, number>();
    const stairSerialOf = new Map<DetectedStair, number>();
    let stairSerial = 0;
    const blobs = findStairBlobs(
      classified.classMap,
      classified.entryMap,
      palette,
      classified.width,
      classified.height,
      {
        minAreaPx: sqMetresToPx(params.minStairAreaSqM),
        maxAreaPx: sqMetresToPx(params.maxStairAreaSqM),
        maxElongation: params.maxStairElongation,
        mergeDistancePx: toPx(params.stairMergeDistanceMeters),
      },
    );

    const glyphs = new Map<number, GlyphSignature | undefined>();

    for (const blob of blobs) {
      let owner: (typeof built)[number] | undefined;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const candidate of built) {
        const distance = distanceToGraph(candidate.graph, blob);
        if (distance === undefined || distance >= bestDistance) continue;
        bestDistance = distance;
        owner = candidate;
      }
      if (!owner) continue;

      const attached = attachStair(owner.graph, blob, {
        maxAttachDistancePx: toPx(params.maxControlSnapMeters),
        snapToExistingPx: toPx(params.junctionMergeRadiusMeters),
      });
      if (!attached) continue;

      owner.graph = attached.graph;
      const ownerSerial = stairSerial;
      glyphs.set(stairSerial, extractGlyph(classified.classMap, classified.width, classified.height, blob, {
        searchRadiusPx: toPx(4),
        minGlyphAreaPx: sqMetresToPx(0.05),
        maxGlyphAreaPx: sqMetresToPx(3),
        size: 12,
      }));
      glyphPanel.set(stairSerial, owner.panelIndex);
      stairSerialOf.set(attached.stair, stairSerial);
      stairSerial++;

      const list = stairsByPanel.get(owner.panelIndex);
      if (list) list.push(attached.stair);
      else stairsByPanel.set(owner.panelIndex, [attached.stair]);

      // A stair whose ink also abuts a second panel is a within-page
      // transition: a mezzanine drawn in place, its foot on one floor area and
      // its landing on another, on the same sheet. Letter pairing cannot
      // connect it — the mezzanine side has no letter of its own — so it is
      // attached to both panels and bridged directly. Page margins are outside
      // pixels far wider than the reach, so a stair whose partner is on
      // another drawn floor never qualifies.
      // Near a page seam nothing bridges: the panels on either side are
      // different drawn floors however close the compositor put them.
      const reachPx = toPx(params.stairBridgeReachMeters);
      const nearSeam = (input.seams?.offsets ?? []).some((offset) =>
        input.seams?.axis === "x"
          ? blob.minX - reachPx <= offset && offset <= blob.maxX + reachPx
          : blob.minY - reachPx <= offset && offset <= blob.maxY + reachPx,
      );
      if (nearSeam) continue;

      for (const other of built) {
        if (other === owner) continue;
        if (!stairAbutsPanel(blob, other.panel.mask, reachPx)) continue;

        const attachedTwin = attachStair(other.graph, blob, {
          maxAttachDistancePx: toPx(params.maxControlSnapMeters),
          snapToExistingPx: toPx(params.junctionMergeRadiusMeters),
        });
        if (!attachedTwin) continue;

        other.graph = attachedTwin.graph;
        // The twin carries no glyph: the single drawn letter belongs to the
        // owner side, and offering the same glyph twice would double-pair.
        glyphs.set(stairSerial, undefined);
        glyphPanel.set(stairSerial, other.panelIndex);
        stairSerialOf.set(attachedTwin.stair, stairSerial);
        bridges.push({ a: ownerSerial, b: stairSerial });
        stairSerial++;

        const twinList = stairsByPanel.get(other.panelIndex);
        if (twinList) twinList.push(attachedTwin.stair);
        else stairsByPanel.set(other.panelIndex, [attachedTwin.stair]);
      }
    }

    // Each control goes to the panel whose graph it is nearest to, the same rule
    // stairs use. Requiring the control's pixel to land inside the free-space
    // mask is too brittle: a control is a drawn symbol, and its centre routinely
    // falls on its own circle, on a course line, or on any other overprint - none
    // of which are free space. Those controls were silently dropped.
    const controlsByPanel = new Map<number, typeof controlPixels>();
    const wallTolerancePx = Math.max(2, toPx(params.maxWallCrossingMeters));
    const originSearchPx = Math.max(4, toPx(1.5));

    for (const control of controlPixels) {
      // Panels are tried nearest first, and the first one the control can
      // actually see wins. Taking the nearest panel outright puts a control that
      // sits against a party wall on the far side of it: geometrically closest,
      // separated by masonry. The sight test then rejects the attachment and the
      // control is dropped, even though the panel one step further away is the
      // one it belongs to.
      //
      // The probe is the same sighted snap attachControls performs, so a panel
      // is selected exactly when attachment into it would succeed.
      const origin = nearestFreePixel(freeSpace, control.px, control.py, originSearchPx) ?? control;
      const ranked = built
        .map((candidate) => ({
          candidate,
          distance: distanceToGraph(candidate.graph, control),
        }))
        .filter((entry): entry is { candidate: (typeof built)[number]; distance: number } =>
          entry.distance !== undefined,
        )
        .sort((a, b) => a.distance - b.distance);

      let owner: (typeof built)[number] | undefined;
      for (const entry of ranked) {
        if (entry.distance > toPx(params.maxControlSnapMeters)) break;
        const probe = snapPointToGraph(entry.candidate.graph, control, { kind: "control" }, 0, {
          maxDistancePx: toPx(params.maxControlSnapMeters),
          accept: (candidate) => hasLineOfSight(freeSpace, origin, candidate, wallTolerancePx),
        });
        if (probe) {
          owner = entry.candidate;
          break;
        }
      }
      // Nothing visible: fall back to the nearest so the control is at least
      // reported against a panel rather than vanishing.
      owner ??= ranked[0]?.candidate;
      if (!owner) continue;
      const list = controlsByPanel.get(owner.panelIndex);
      if (list) list.push(control);
      else controlsByPanel.set(owner.panelIndex, [control]);
    }

    pageGlyphs.push({ glyphs, panels: glyphPanel });

    for (const entry of built) {
      const { panelIndex, panel } = entry;
      const inPanel = controlsByPanel.get(panelIndex) ?? [];

      const controlResult = attachControls(entry.graph, inPanel, {
        maxSnapDistancePx: toPx(params.maxControlSnapMeters),
        snapToExistingPx: toPx(params.junctionMergeRadiusMeters),
        freeSpace,
        wallTolerancePx,
        originSearchPx,
      });
      entry.graph = controlResult.graph;

      for (const hit of controlResult.attached) accountedControls.add(hit.controlId);
      for (const missing of controlResult.unattached) {
        accountedControls.add(missing.controlId);
        const message =
          missing.reason === "no-sight"
            ? `Control ${missing.controlId} is ${((missing.distancePx ?? 0) * metresPerPixel).toFixed(1)} m ` +
              `from the graph, but every attachment point within ${params.maxControlSnapMeters} m is behind ` +
              `a wall. Check the free-space mask around it (--dump-mask).`
            : missing.reason === "too-far"
              ? `Control ${missing.controlId} is further than ${params.maxControlSnapMeters} m from the ` +
                `generated graph and was left unattached.`
              : `Control ${missing.controlId} could not be attached: its panel produced no graph.`;
        diagnostics.push({
          severity: "warning",
          code: "control-unattached",
          message,
          where: { panelIndex, pageIndex: page.index, position: mapping.toEvent(missing.px, missing.py) },
        });
      }

      const converted = tracedGraphToEvent(entry.graph, mapping, ids);
      vertices.push(...converted.vertices);
      edges.push(...converted.edges);

      for (const stair of stairsByPanel.get(panelIndex) ?? []) {
        const id = converted.idByTracedNode.get(stair.nodeId);
        if (!id) continue;
        stairs.push({
          id,
          panelIndex,
          position: mapping.toEvent(stair.px, stair.py),
          variant: stair.variant,
          areaSqM: stair.areaPx * metresPerPixel * metresPerPixel,
          serial: stairSerialOf.get(stair),
        });
      }

      const outline = traceOuterContour(panel.mask, toPx(params.simplifyToleranceMeters));
      panels.push({
        index: panelIndex,
        pageIndex: page.index,
        outline: outline.map((p) => mapping.toEvent(p.px, p.py)),
        areaSqM: panel.areaPx * metresPerPixel * metresPerPixel,
      });

      diagnoseSegmentation(converted, panelIndex, page.index, diagnostics);
      diagnoseWallCrossings(
        entry.graph,
        converted,
        freeSpace,
        Math.max(2, toPx(params.maxWallCrossingMeters)),
        panelIndex,
        page.index,
        diagnostics,
      );
    }
  }

  pairStairs(stairs, pageGlyphs, diagnostics, edges, bridges, params.stairPairMinSimilarity);

  // A control whose pixel lands on a wall, on an unclassified pixel, or outside
  // every panel never reaches attachControls, so it would otherwise vanish with
  // no attachment and no warning. The guarantee is that every control is either
  // attached or reported.
  for (const control of input.controls ?? []) {
    if (accountedControls.has(control.id)) continue;
    diagnostics.push({
      severity: "warning",
      code: "control-unattached",
      message: `Control ${control.id} did not fall inside any detected floor panel and was left unattached.`,
      where: { position: control.mapPosition },
    });
  }

  if (stairs.length % 2 !== 0) {
    diagnostics.push({
      severity: "info",
      code: "stair-unpaired",
      message: `${stairs.length} stair candidates were found — an odd count, so at least one has no partner on another floor.`,
    });
  }

  return { vertices, edges, panels, stairs, diagnostics, roleFractions, unmatchedColours };
}

function diagnosePalette(
  roleFractions: number[],
  unmatched: { rgb: [number, number, number]; fraction: number }[],
  pageIndex: number,
  diagnostics: Diagnostic[],
): void {
  const unknown = roleFractions[roleCode("unknown")];
  const passable = roleFractions[roleCode("passable")];

  if (unknown > 0.25 || passable < 0.02 || passable > 0.4) {
    const worst = unmatched
      .slice(0, 3)
      .map(
        ({ rgb, fraction }) =>
          `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")} (${(fraction * 100).toFixed(1)}%)`,
      )
      .join(", ");

    diagnostics.push({
      severity: "warning",
      code: "palette-mismatch",
      message:
        `The palette does not fit this map well: ${(unknown * 100).toFixed(1)}% of pixels matched nothing ` +
        `and ${(passable * 100).toFixed(1)}% classified as passable. Dominant unmatched colours: ${worst}.`,
      where: { pageIndex },
    });
  }
}

function diagnoseSegmentation(
  converted: { vertices: Node[]; edges: Edge[] },
  panelIndex: number,
  pageIndex: number,
  diagnostics: Diagnostic[],
): void {
  if (converted.vertices.length === 0) return;
  const meanDegree = (2 * converted.edges.length) / converted.vertices.length;

  if (meanDegree > 2.6) {
    diagnostics.push({
      severity: "warning",
      code: "over-segmented",
      message:
        `Panel ${panelIndex} has a mean node degree of ${meanDegree.toFixed(2)}; the hand-drawn corpus ` +
        `runs 2.05–2.23. Try a larger junction merge radius or simplification tolerance.`,
      where: { panelIndex, pageIndex },
    });
  }
}

/**
 * Joins stair candidates into cross-floor edges.
 *
 * A stair edge carries `ignoreLength` because a building's floors are drawn side
 * by side on a flat sheet: the horizontal gap between the two ends of a
 * staircase is a printing artefact, not distance anyone runs.
 *
 * Labels are compared as shapes, never recognised as characters, so a wrong
 * match surfaces as a low similarity score rather than as a confidently wrong
 * connection between storeys. Anything below `confidentSimilarity` is emitted
 * but flagged for review.
 */
function pairStairs(
  stairs: StairCandidate[],
  pageGlyphs: { glyphs: Map<number, GlyphSignature | undefined>; panels: Map<number, number> }[],
  diagnostics: Diagnostic[],
  edges: Edge[],
  bridges: { a: number; b: number }[],
  minSimilarity = 0.86,
  confidentSimilarity = 0.94,
): void {
  const glyphs: (GlyphSignature | undefined)[] = [];
  const panelOf: number[] = [];
  const bySerial = new Map<number, StairCandidate>();

  for (const page of pageGlyphs) {
    for (const [serial, glyph] of page.glyphs) {
      glyphs[serial] = glyph;
      panelOf[serial] = page.panels.get(serial) ?? -1;
    }
  }
  for (const stair of stairs) {
    if (stair.serial !== undefined) bySerial.set(stair.serial, stair);
  }

  // Within-page bridges are ordinary edges, not lettered transitions: both
  // ends sit a few metres apart on the same sheet, so the drawn distance is the
  // real distance and no letter convention applies.
  const bridged = new Set<number>();
  for (const bridge of bridges) {
    const a = bySerial.get(bridge.a);
    const b = bySerial.get(bridge.b);
    if (!a || !b) continue;
    edges.push({ from: a.id, to: b.id, label: "", oneWay: false, ignoreLength: false });
    bridged.add(bridge.a);
    bridged.add(bridge.b);
    diagnostics.push({
      severity: "info",
      code: "stair-bridged",
      message:
        `Stairs ${a.id} and ${b.id} join two floor areas on the same sheet ` +
        `(a stair drawn in place) and were bridged directly.`,
      where: { position: a.position },
    });
  }

  const pairs = pairStairsByGlyph(glyphs, panelOf, minSimilarity);

  let next = 0;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (const pair of pairs) {
    const a = bySerial.get(pair.a);
    const b = bySerial.get(pair.b);
    if (!a || !b) continue;

    // Upper case leaves the lower floor, lower case returns - the convention the
    // hand-drawn graphs already use for stair labels.
    const letter = alphabet[next % alphabet.length] + (next >= 26 ? String(Math.floor(next / 26)) : "");
    next++;

    edges.push({
      from: a.id,
      to: b.id,
      label: letter,
      reverseLabel: letter.toLowerCase(),
      oneWay: false,
      ignoreLength: true,
    });

    if (pair.similarity < confidentSimilarity) {
      diagnostics.push({
        severity: "warning",
        code: "stair-pair-uncertain",
        message:
          `Stairs ${a.id} and ${b.id} were paired as "${letter}" on a label similarity of ` +
          `${pair.similarity.toFixed(2)}. Check that they are really the same staircase.`,
        where: { position: a.position },
      });
    }
  }

  const paired = new Set(pairs.flatMap((p) => [p.a, p.b]));
  for (const serial of bridged) paired.add(serial);
  const unpaired = stairs.filter((s) => s.serial === undefined || !paired.has(s.serial));

  // Say why each one failed. "No label found", "no partner resembled it" and
  // "its lookalike preferred another stair" call for different fixes, and
  // lumping them together hides which is happening.
  for (const stair of unpaired) {
    const glyph = stair.serial !== undefined ? glyphs[stair.serial] : undefined;
    if (!glyph) {
      diagnostics.push({
        severity: "info",
        code: "stair-unpaired",
        message: `Stair ${stair.id} has no readable letter label next to it.`,
        where: { position: stair.position },
      });
      continue;
    }
    let bestOther = 0;
    for (let i = 0; i < glyphs.length; i++) {
      const other = glyphs[i];
      if (!other || i === stair.serial || panelOf[i] === panelOf[stair.serial as number]) continue;
      bestOther = Math.max(bestOther, glyphSimilarity(glyph, other));
    }
    diagnostics.push({
      severity: "info",
      code: "stair-unpaired",
      message:
        bestOther >= minSimilarity
          ? `Stair ${stair.id}: its best label match (${bestOther.toFixed(2)}) preferred a different ` +
            `stair, so no mutual best match. Connect by hand if they really pair.`
          : `Stair ${stair.id}: best label match on another floor scored ${bestOther.toFixed(2)}, below ${minSimilarity}.`,
      where: { position: stair.position },
    });
  }

  diagnostics.push({
    severity: unpaired.length > 0 ? "warning" : "info",
    code: "stair-paired",
    message:
      `${pairs.length} stair pairs were matched by label shape; ${unpaired.length} candidates ` +
      `were left unpaired and need connecting by hand.`,
  });
}

/**
 * Reports edges that run through blocked pixels.
 *
 * This is the design's correctness invariant, not a tuning signal: a route that
 * walks through a wall is wrong however good the graph looks by every other
 * measure. A short blocked run is tolerated because a straight chord across a
 * bending corridor legitimately clips its inside edge.
 */
function diagnoseWallCrossings(
  graph: TracedGraph,
  converted: { idByTracedNode: Map<number, string> },
  freeSpace: BitMask,
  tolerancePx: number,
  panelIndex: number,
  pageIndex: number,
  diagnostics: Diagnostic[],
): void {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  let worst = 0;
  let offenders = 0;

  for (const edge of graph.edges) {
    const a = nodeById.get(edge.a);
    const b = nodeById.get(edge.b);
    if (!a || !b) continue;

    // Walk the polyline, not the chord between the endpoints. An edge that
    // follows a bending corridor is not a straight line, and measuring it as one
    // reports a wall crossing for geometry the edge does not have.
    const path = [a, ...edge.polyline, b];
    let run = 0;
    for (let i = 0; i < path.length - 1; i++) {
      run = Math.max(run, longestBlockedRun(freeSpace, path[i], path[i + 1]));
    }

    if (run <= tolerancePx) continue;
    offenders++;
    if (run > worst) worst = run;
  }

  if (offenders > 0) {
    diagnostics.push({
      severity: "warning",
      code: "edge-crosses-wall",
      message:
        `Panel ${panelIndex} has ${offenders} edge(s) passing through blocked pixels, the worst ` +
        `for ${worst} pixels. Routes over those edges walk through a wall.`,
      where: { panelIndex, pageIndex },
    });
  }
}
