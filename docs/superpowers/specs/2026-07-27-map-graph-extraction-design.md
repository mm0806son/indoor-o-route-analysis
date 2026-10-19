# Map Graph Extraction — Design

Date: 2026-07-27
Status: revised after design-gate review; pending implementation plan

## Problem

Building the routing graph for an event is the dominant manual cost in this project.
Measured across the 23 example events in `apps/web/public/examples/`, each event carries
202–617 hand-placed vertices and 272–684 hand-drawn edges. Every new event repeats that work.

This design covers automatic generation of the **planar (per-floor) graph**, **stair candidate
detection**, and **attachment of existing controls to the generated graph**, reducing the manual
step to reviewing the result and pairing stairs.

Out of scope (separate effort): porting features from `via-indoor-analysis` (geometric
blockades, SCC softlock detection, leg suggestion, route-merge rendering).

## Findings that shaped the design

All measured, not assumed.

### The maps are colour-coded

Indoor orienteering maps follow the Swedish indoor *kartnorm*. There is no IOF indoor
specification; ISSprOM 2019-2 Revision 6 (January 2024) is the closest official standard, and
the indoor norm reuses ISSprOM inks with indoor-specific meanings. Passable floor is a
dedicated ink, so extraction is a **colour segmentation** problem rather than wall detection.

The authoritative role table comes from `kartsymboler indoor (version 20241011).omap`
(42 colours, 73 symbols). **Symbol definitions are authoritative; colour names are not** —
`Svart 20% (genomgång. ej berg)` reads like "passage" but its only consuming symbol is
`526.2 Skåp o dyl` (cupboards), an obstacle.

| Role | Symbols |
| --- | --- |
| passable | `529.0 Golv`, `305.2/305.5 Utepassage`, `404.1 Nedsatt löpbarhet` |
| furniture (in-room, merged into room space) | `526.2 Skåp o dyl`, `408.0 Bord`, `527.1 Soffa/stol`, `419.x Växt` |
| blocked | `526.1 Byggnad fyllning`, `521.1 Yttervägg`, `529.9 Innervägg`, `529.10 Uppställd-vägg`, `524.0 Staket opasserbart`, `707.x Förbjudet område`, `714.0 Diverse bråte`, `305.3 Vatten`, **`102.0 Delningsstreck mellan våningar`** |
| stairs | `401.1 Röd trappfärg`, `401.2 Blå trappfärg`, `101.x Trappsteg`, `102.9 Spiraltrappa` |
| overprint (excluded from free space) | `708.x Avspärning`, `707.0 Opasserbar gränslinje`, `603.1 Trappbokstav` |
| outside | `Vit` and unmatched |

`102.0 Delningsstreck mellan våningar` (the floor-division line) **must** map to `blocked`:
it is the separator that keeps adjacent floor panels from merging into one component.

One-way symbols (`123.x Enkelriktad`) are recognised by the palette but **no stage consumes
them** in this version; `Edge.oneWay` is always emitted `false`. Automatic one-way detection is
deferred.

Validated on a fresh map (`Kårhuset.Svår.pdf`, OCAD 2020, O-Ringen Indoor 2026):
`Golv` ΔE 1.5, building grey ΔE 1.9 against measured map colours.

### One pipeline for vector and raster

Of the 23 example maps, 17 are vector PDFs and 6 are raster; the user's own supply is
raster-dominated. Rather than branching, **everything is rasterised** at a working DPI and
processed identically. At 1:500 and 150 dpi one pixel is ~8.5 cm — well below the precision
that matters — and the colour semantics are identical in both forms.

**Open validation item:** the ΔE thresholds were tuned on a clean vector render. They must be
re-measured on at least one of the six raster examples (JPEG artefacts, anti-aliasing and
resampling all invent boundary colours) before the defaults are frozen.

### The hand-drawn graph is a corridor centreline graph

Across all 23 events: mean degree 2.05–2.23, 60–80% of nodes have degree 2, 10–20% are dead
ends, median edge length 4.5–13 m. That is what a pruned medial axis produces, which is why
skeletonisation is the right primitive.

### Controls are graph nodes, not decoration

In Herkules E1, **53 of 509 edges have a control as an endpoint**. `renameAllNodes`
(`packages/core/src/utils/graph-utils.ts`) preserves control ids as graph node ids, and
`RouteAnalyzer` can only route between controls that have edges into the vertex graph.
A generated graph with unattached controls is unroutable — every leg fails.

### Failure modes observed during feasibility work

1. **Ghost bridging** — including the magenta course overprint in the passable set let the
   course's straight inter-control lines merge all floor panels into one component.
2. **Forced mis-classification** — nearest-neighbour colour matching always returns something.
   The blue floor-panel frame matched "building" at ΔE 41 and would have become a solid wall.
3. **Over-segmentation** — raw skeleton junction pixels fragment; a first run produced ~4.7×
   the junction count of the hand-drawn graph.

## Coordinate and unit model

This is the highest-risk boundary in the design and is specified explicitly.

**Event coordinates are not document millimetres.** Measured across the corpus, the ratio of
event-unit span to document-mm span ranges from **0.50 to 1.96** (Oslomesterskapet 0.50,
Herkules E2 0.66, Vestfold 1.96, SIC 2026 E2 1.80). Event space is an arbitrary calibrated
space defined by `mapPositionTopLeft` / `mapPositionBottomRight` and, for manual multi-page
maps, by per-page `pageTransforms`.

The project's metre convention is `metres = eventUnits × mapScale × MM_TO_METERS`
(`packages/core/src/utils/geometry.ts`, `straightLineDistanceMeters`).

Therefore **pixel→metre must be derived from the event transform, never from DPI**:

```
metresPerPixel = |toEvent(px + (1,0)) − toEvent(px)| × mapScale × 0.001
```

computed once per page from the page's own transform. All metre-valued parameters are
converted to pixels through this factor. Using `DPI × scale` instead would be wrong by up to
2× on maps in the existing corpus.

## Page and panel model

`layout` is `horizontal` (19 events) or `pages` (4 events) in the corpus.

- The pipeline consumes **a list of page images**, not a single image:
  `PageImage { index: number; image: RasterImage }`.
- Each page is processed independently and `to-event` is given that page's index so it can
  select the correct transform.
- For `horizontal` / `vertical` composited maps, a **1 px `blocked` seam is painted along each
  page boundary before morphology**, so closing cannot join free space across the seam and no
  polyline can straddle a transform discontinuity.
- A **floor panel is a connected component of the free-space mask within one page.** Panels are
  not pages and not levels: SIC 2023 E2 has 12 hand-drawn panel polygons across 5 levels.

## Architecture

New module `packages/core/src/map-graph-extraction/`. Pure functions over plain typed arrays:
no DOM types, no Node APIs, so web and CLI share one implementation.

| Module | Responsibility | In → Out |
| --- | --- | --- |
| `raster.ts` | Environment adapter contract for producing `RasterImage` from a map document | (per-environment) → `PageImage[]` |
| `palette.ts` | Colour table + pixel classification | `RasterImage`, `Palette` → `classMap: Uint8Array` |
| `indoor-kartnorm.generated.ts` | Colour/role table generated from the `.omap` | — |
| `free-space.ts` | Role → free-space mask, seam painting, morphological cleanup | `classMap`, `RoleMap` → `BitMask` |
| `panels.ts` | Connected components → panel masks | `BitMask` → `PanelMask[]` |
| `skeleton.ts` | Zhang–Suen thinning | `BitMask` → `BitMask` |
| `trace.ts` | Skeleton → `TracedGraph` (junction-indexed) | `BitMask` → `TracedGraph` |
| `simplify.ts` | Spur pruning, junction merge, RDP, resample | `TracedGraph` → `TracedGraph` |
| `stairs.ts` | Stair area detection, attach to nearest polyline | `classMap`, `TracedGraph` → `StairCandidate[]` |
| `attach-controls.ts` | Snap existing controls onto the graph | `TracedGraph`, `Control[]` → `TracedGraph` |
| `to-event.ts` | Pixel → event coordinates for one page | `TracedGraph`, `MapData`, pageIndex → `Node[]`, `Edge[]` |
| `pipeline.ts` | Orchestration, parameters, diagnostics | `PageImage[]` → `ExtractionResult` |

`palette.ts` through `simplify.ts` know only about pixels. Only `to-event.ts` knows about
`MapData`. That boundary lets the pixel modules be unit-tested with hand-written bitmaps and no
event data.

`RasterImage` is structural, not the DOM `ImageData`:

```ts
interface RasterImage { width: number; height: number; data: Uint8ClampedArray } // RGBA
```

**Rasterisation is an explicit, owned dependency, not an implicit step.** `packages/core` has no
PDF renderer today (`jspdf` writes PDFs; `pdfjs-dist` currently lives only in `apps/web`). The
web path renders with `pdfjs-dist` to an `OffscreenCanvas`; the CLI and the Vitest regression
suite need a Node-side renderer (`pdfjs-dist` plus a canvas implementation). `raster.ts` defines
the contract; each environment supplies an adapter.

## Traced graph and node identity

`trace.ts` emits an explicitly indexed structure so that node identity survives simplification.
After RDP and resampling, endpoint coordinates are no longer bit-identical, so identity must be
carried **by reference**, never recovered by coordinate equality:

```ts
interface TracedGraph {
  nodes: { id: number; px: number; py: number; kind: "junction" | "dead-end" | "chain" | "stair" | "control" }[];
  edges: { a: number; b: number; polyline: { px: number; py: number }[] }[];
  panelIndex: number;
  pageIndex: number;
}
```

A junction where three branches meet is one node id referenced by three edges, from tracing
onward. Thinning is **Zhang–Suen**; the choice is fixed because Guo–Hall and ridge-following
produce different junction topology and therefore different node counts.

The distance transform is used for one purpose only: **spur pruning keeps a dead-end branch if
its terminal clearance indicates a real alcove rather than a medial-axis artefact.** If that
rule is not implemented, the distance transform is dropped rather than left vestigial.

## Control attachment

For each control in the event, within the panel containing its position:

1. Find the nearest point on any traced polyline.
2. If the distance exceeds `maxControlSnapMeters`, emit a `control-unattached` diagnostic and
   leave the control alone — never guess.
3. Otherwise split the edge at that point, inserting a node whose id **is the control's id**
   (matching the existing convention that control ids are graph node ids).

Controls are attached before `to-event` so they participate in resampling decisions.

## Output types

`Node` and `Edge` are emitted exactly as `packages/core/src/models/graph.ts` defines them.
Panels are **not** emitted as `Polygon` directly: `Polygon.level` is a required `number`
(`packages/core/src/models/polygon.ts`) and there is no safe sentinel — level 0 is a real floor
in 10 events and Camp-Stokke uses −1. Panels are staged and materialised into `Polygon` only
once the user assigns a level on acceptance.

```ts
interface ExtractionResult {
  vertices: Node[];
  edges: Edge[];                  // label:"", oneWay:false, ignoreLength:false
  panels: PanelCandidate[];
  stairs: StairCandidate[];
  diagnostics: Diagnostic[];
}

interface PanelCandidate {
  index: number;
  pageIndex: number;
  outline: MapPosition[];
  holes?: MapPosition[][];        // atria retained by maxFillHoleAreaSqM
  areaSqM: number;
  level?: number;                 // assigned by the user; Polygon is built on acceptance
}

interface StairCandidate {
  id: string;                     // node id, already attached to the panel graph
  panelIndex: number;
  position: MapPosition;
  variant: "red" | "blue";        // 401.1 Röd / 401.2 Blå trappfärg
  areaSqM: number;
}

interface Diagnostic {
  severity: "error" | "warning" | "info";
  code: "panel-bridged" | "palette-mismatch" | "over-segmented"
      | "stair-unpaired" | "control-unattached";
  message: string;
  where?: { panelIndex?: number; pageIndex?: number; position?: MapPosition };
}
```

### Id allocation

Vertex ids are **not** always numeric: Ale E1/E2 and Moss are 100% UUID, Åre is 247/253. Control
ids share the edge-endpoint namespace and reach 235 (Fossum). The existing editor already floors
new ids at 1000 (`apps/web/components/graph-editor/map-viewer.tsx`). The rule is therefore:

```
nextId = max(999, max(numeric vertex ids), max(numeric control ids)) + 1
```

Non-numeric ids are ignored for the maximum but never reused. This is also correct for a brand
new event with zero vertices, which is the primary use case.

### Stair pairing

Stairs are **not** paired automatically and no OCR is performed, so the tool cannot silently
connect the wrong floors. The user pairs candidates in the graph editor; the tool then creates
the `ignoreLength` edge and assigns `label` / `reverseLabel`.

## Parameters

Expressed in metres, converted to pixels via `metresPerPixel` derived from the event transform
(see the coordinate model above). Defaults come from the 23-event hand-drawn corpus.

| Parameter | Default | Basis |
| --- | --- | --- |
| `workingDpi` | 150 | 1 px ≈ 8.5 cm at 1:500; keeps images near 2 Mpx |
| `deltaEAccept` | 20 | `Golv` 1.5 and building 1.9 accepted; blue frame 31.0 rejected |
| `deltaEMarginAccept` | 30, and `best < 0.6 × second` | recovers the apricot floor (23.3 vs 39.8) without admitting the blue frame (31.0 vs 33.3) |
| `closingRadiusMeters` | 0.3 | bridges corridors cut by overprint lines (~0.18 m at 1:500) |
| `maxFillHoleAreaSqM` | 4 | swallows in-room furniture, keeps real atria |
| `minPanelAreaSqM` | 50 | drops legend swatches and fragments |
| `minBranchLengthMeters` | 3 | shorter dead-end branches are medial-axis noise; real dead ends (10–20% of nodes) survive |
| `junctionMergeRadiusMeters` | 1.5 | corrects measured junction over-segmentation |
| `simplifyToleranceMeters` | 0.5 | keeps corridor bends, drops pixel stair-stepping |
| `targetNodeSpacingMeters` | 6 | median of per-event median edge lengths is 6.3 m |
| `maxControlSnapMeters` | 5 | beyond this, report rather than guess |
| `maxWallCrossingMeters` | 0.5 | wall-crossing invariant threshold |

## Palette generation

`scripts/generate-palette.ts` reads `kartsymboler indoor (version YYYYMMDD).omap`, resolves each
`<symbol>` to the `<color>` entries it references, **renders the symbol sheet through pdf.js and
samples each ink's actual rendered colour**, and emits `indoor-kartnorm.generated.ts` carrying
CMYK, measured sRGB, role, and source version. CI verifies the generated file matches its source.

Sampling rather than converting is required: the naive DeviceCMYK→sRGB formula is accurate for
light tints (the ones that matter) but badly wrong for saturated inks — `Täckande violett`
computes to `#F20DFF` against a measured `#C60A8D`, ΔE 50.9, which caused overprint and one-way
marks to go undetected in the feasibility run. Sampling also absorbs renderer differences between
poppler and pdf.js.

## Testing

**Unit tests** use synthetic bitmaps and need no event data:

- `classify` — known RGB → role; rejection threshold and margin rule boundary cases
- `free-space` — a 2 px gap is bridged; small holes filled; small objects dropped; seam painting blocks a join across a page boundary
- `panels` — two disjoint blobs yield two panels
- `skeleton` / `trace` — a 3 px wide plus yields one junction node referenced by four edges
- `simplify` — collinear chains collapse; junction clusters merge preserving node identity; short spurs prune
- `stairs` — a stair-coloured blob attaches to the nearest polyline
- `attach-controls` — a control inside a corridor splits the edge and takes the control's id; a control beyond `maxControlSnapMeters` produces a diagnostic and no edge
- `to-event` — pixel ↔ event coordinates round-trip through the existing transform, including a manual per-page multi-page map
- `ids` — allocation over a UUID corpus, an empty graph, and numeric control ids

**Regression tests** need no new data fixtures: the 23 files in `apps/web/public/examples/` each
carry both an embedded map document and a hand-drawn graph. They do require the Node
rasterisation harness noted above.

| Metric | Assertion |
| --- | --- |
| panel count | equals the hand-drawn **polygon** count (not level count); Villa-Pisani has 0 polygons and is excluded |
| node count | within [0.5×, 2.5×] of the hand-drawn graph |
| mean degree | ∈ [2.0, 2.4] |
| coverage (recall) | p90 distance from each hand-drawn node to the nearest generated node < 3 m |
| precision | p90 distance from each generated node to the nearest hand-drawn node < 3 m, per panel |
| control attachment | every control is attached, or carries a `control-unattached` diagnostic |
| wall-crossing | no generated edge crosses `blocked` pixels for more than `maxWallCrossingMeters` |
| panel isolation | no generated edge joins two panels |

Coverage and precision are stated as a pair deliberately: coverage alone is passed by a
generator that carpets all passable space.

Panel isolation holds by construction of the per-panel loop, so it is a **guard against
regression in that loop**, not evidence that ghost bridging is prevented.

## Failure handling

| Mode | Detection | Response |
| --- | --- | --- |
| ghost bridging | free-space component whose two large lobes are joined only by a corridor narrower than a threshold; also panel count below the hand-drawn polygon count where known | warning with the bridge location; advise a course-free base map. **Per-panel processing does not prevent this** — it prevents edges between components, whereas bridging merges components. The actual mitigations are overprint exclusion in `roleAssignment` and ΔE rejection. |
| palette mismatch | `unknown > 25%`, or passable fraction outside [2%, 40%] | warning listing dominant unmatched colours and their pixel share; manual colour assignment remains available |
| over-segmentation | mean degree > 2.6 | expose `junctionMergeRadiusMeters` and `simplifyToleranceMeters`; show live node count |
| unpaired stairs | stair candidates left unpaired after review | warning listing positions |
| unattached controls | control beyond `maxControlSnapMeters` from any polyline | warning listing the control ids and positions |

## Delivery

- Algorithms in `packages/core`, testable with Vitest independently of both front ends.
- `apps/mapgraph-cli` for batch runs and regression sweeps.
- A "generate from map" action in `apps/web/components/graph-editor` calling the same functions,
  in a Web Worker so the UI stays responsive.

Both paths stay fully local: no network access, consistent with the project's constraints.

## Known open items

1. ΔE thresholds not yet validated on a raster example.
2. Node-side rasterisation dependency not yet chosen.
3. One-way detection deferred; `Edge.oneWay` always `false`.

## References

- ISSprOM 2019-2 Revision 6, January 2024 — IOF sprint map specification
- `kartsymboler indoor (version 20241011).omap` — Swedish indoor kartnorm (Stockholm Indoor Cup / Indoor Grand Prix)
- Feasibility measurements on `Kårhuset.Svår.pdf` (O-Ringen Indoor 2026, Chalmers) and the 23 example events
