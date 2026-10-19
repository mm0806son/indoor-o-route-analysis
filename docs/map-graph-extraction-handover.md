# Map Graph Extraction — Handover

Status: **paused, working**. 2026-07-28 (updated same day: control attachment fixed).

Automatic generation of the routing graph from an indoor orienteering map raster,
so that a new event no longer needs 200–600 hand-placed vertices.

The acceptance bar set for this work was *"be able to start searching routes with
the original author's code, whether the nodes are drawn automatically or by
hand"*. That bar is met: `RouteAnalyzer` runs on a fully generated graph and
returns leg-by-leg distance, difficulty, decision points and alternatives.

---

## What you can do right now

```bash
pnpm dev
# choose "Ale Indoor 2026 E1 (generated graph)" from the examples
```

`apps/web/public/examples/2026-01-04-Ale-Indoor-E1-generated.json` holds 938
vertices and 1082 edges, **none of them hand-drawn**. Controls, courses and the
map come from the original event; only the graph was replaced.

Route search from the command line:

```bash
pnpm --filter analyse-cli start \
  apps/web/public/examples/2026-01-04-Ale-Indoor-E1-generated.json \
  shortest-path --from 39 --to 78

pnpm --filter analyse-cli start \
  apps/web/public/examples/2026-01-04-Ale-Indoor-E1-generated.json \
  analyze-course --course H21
```

Generating a graph for another event:

```bash
pdftoppm -r 150 -f 1 -l 1 map.pdf page          # any raster works; PPM is what the CLI reads
pnpm --filter mapgraph-cli start page-1.ppm \
  --event apps/web/public/examples/<event>.json \
  --lut --no-barriers --out graph.json
```

Useful flags: `--lut` (learned colour table, recommended), `--no-barriers` (see
*Barriers* below), `--dump-mask <prefix>` (writes the free-space mask as PGM —
the fastest way to see why something went wrong), `--opening`, `--clearance`,
`--snap`, `--pair-sim`, `--min-panel`.

---

## Measured state

Ale Indoor 2026 E1, generated graph versus the hand-drawn one:

| | generated | hand-drawn |
| --- | --- | --- |
| vertices | 938 | 457 |
| edges | 1087 | 514 |
| controls attached | 40 / 40 | 40 / 40 |
| stair links | 19 auto-paired + 2 bridged in place | hand-drawn |
| edges crossing a wall | 2 (worst 8 px) | — |

Routable legs per course: **H21 26/26, H40 19/19, DH12 20/20, H16 19/19 —
every leg of every course routes.** Visual review of all fixes:
`https://claude.ai/code/artifact/9c8e1dce-7e83-4444-b07e-cbb42cb52fda`.

Kårhuset (O-Ringen Indoor 2026, the map supplied mid-project and never used for
training or tuning): 524 nodes, 23 panels, 25 stair candidates, 0 % unclassified
pixels. Reviewed visually at
`https://claude.ai/code/artifact/bafc617b-25d2-4344-9d32-f2c7dd67f6ab`.

Tests: 51 unit tests pass in `map-graph-extraction.test.ts` (415 in
`packages/core`), `pnpm typecheck` clean across all packages — including
`packages/ui`, which used to fail on a Node-only `Buffer` in `palette.ts`
(replaced with `atob`, global in browsers and Node 16+). One integration
test asserts a 2-second enumeration bound and can trip when the whole
monorepo's suites run in parallel; standalone it passes reliably. Roughly
5 000 lines including tests.

---

## How it works

The insight the whole approach rests on: **an indoor orienteering map is
colour-coded, so extraction is a segmentation problem, not a wall-detection
problem.** Passable floor is a dedicated ink. That is an order of magnitude more
tractable than generic line detection, and it is why this works on scans.

```
raster ─ classify pixels ─ free-space mask ─ per floor panel ─┐
                                                              ├─ skeletonise
                                                              ├─ trace to a graph
                                                              ├─ merge / prune / simplify
                                                              ├─ attach stairs and controls
                                                              └─ convert to event coordinates
```

`palette` through `simplify` know only about pixels. Only `to-event` knows about
maps and coordinates. That boundary is what lets the pixel stages be unit-tested
with hand-written bitmaps and no event data at all.

### Colour

Two layers. **ISSprOM 2019-2** defines the inks; the **Swedish indoor kartnorm**
(`kartsymboler indoor v20241011`, in `~/projects/orienteering/Kartritning och
Kartnorm/`) defines what each ink means indoors. Roles come from the *symbol*
definitions, never from colour names — `Svart 20% (genomgång. ej berg)` reads
like "passage" but its only consuming symbol is `526.2 Skåp o dyl`, cupboards.

On top of that sits a **learned colour table** (`indoor-colour-lut.generated.ts`,
32 KB, 5 bits per channel). Labels are self-supervised: the palette classifier is
accurate on clean vector renders (`Golv` matches at ΔE 1.5), so its output there
is the target, with unmatched regions resolved from context. Each labelled map is
then degraded four ways — JPEG, blur, colour cast, noise — and the table counts
which role each degraded colour turned out to carry. 17 maps, 80.8 % of cells
populated, weighted purity 95.1 %.

That figure answers a real question: **colour alone carries most of the
decision**, which is why no neural network is needed and why this trains on a
NAS in seconds.

### Detail scales with clearance

The medial axis is only meaningful at the scale of the local clearance. In a
corridor it is the line people walk; in a hall or a tribune it is a branching
star no hand-drawn graph reproduces. Merge radius, node spacing and dead-end
pruning therefore all scale with the distance transform, and a morphological
*opening* smooths serrated boundaries before skeletonising — a stepped tribune
went from 68 nodes to 27 that way.

### Stairs

Stairs carry dedicated area symbols, so their positions come from colour. Pairing
across floors compares the **shape** of the letter labels without recognising
which letter they are. That distinction is what makes it safe to automate: a
misread letter would silently connect the wrong storeys, whereas a mismatched
glyph produces a low similarity score that is reported.

Matching is by **mutual best match per floor pair**. Similarity is not an
equivalence relation — O resembles Q resembles D — so grouping by transitive
closure avalanches; on this map it merged all 36 stairs into one group and wired
shortcuts between unrelated stairwells.

### Correctness invariant

No generated edge may run through blocked pixels. This is enforced, not merely
measured: junction merging, RDP simplification and control attachment all check
line of sight. Enforcing it **reduced** routable legs from 21/26 to 18/26,
because three of those legs had been connected by shortcuts through walls. That
trade is deliberate; `maxWallCrossingMeters` is an explicit parameter.

---

## Open items

Ordered by what they cost.

1. **Barriers versus course overprint.** The violet ink draws both taped-off
   boundaries and, on a map that still carries its courses, every control circle
   and leg line. Colour cannot separate them. Barriers block by default, which is
   correct — a competitor cannot cross tape — but on a course-carrying map a
   control circle becomes a closed ring that cuts its own control off from the
   corridor. Hence `--no-barriers` on Ale. **The real fix is to use a course-free
   base map**; the corpus is full of them (`uten løyper`, `blankt`,
   `bakgrunnskart`).

2. **Parameter fitting is built but has never produced a result.**
   `apps/mapgraph-cli/fit.ts` implements the coverage/precision objective and a
   staged coordinate descent. Two runs were abandoned because the objective was
   insensitive to every parameter, and both times that turned out to be the
   *harness*: first a page/coordinate mismatch on composited multi-page maps,
   then a single event producing no graph and being scored as 1000. Fixed by
   restricting the corpus to single-page events and by throwing on a non-finite
   score. **It has not been re-run since.**

3. **Multi-page composited documents.** `imageSpans: "document"` corrects the
   width but the height conversion is still wrong — verified by comparing
   bounding boxes. Four of the 23 corpus events are affected. Related trap:
   stair serials are numbered per page, so glyph pairing across separate
   `PageImage` entries would collide serials — single-page composites (the only
   form exercised so far) are unaffected.

4. **Node count runs high.** 938 generated against 457 hand-drawn on Ale.

5. **Design doc is stale.** `docs/superpowers/specs/2026-07-27-map-graph-extraction-design.md`
   predates the barrier role, the colour table, clearance-adaptive
   simplification, the line-of-sight invariant, stair pairing, sighted
   candidate snapping and in-place stair bridging.

## Resolved 2026-07-28

- **Control 64's island.** The mezzanine lounge holding
   control 64 was a 9-node component with no link to the main graph. Its only
   entrance is a staircase drawn *in place* — foot on the main floor, landing
   on the mezzanine, both on the same sheet — which letter pairing cannot
   connect (the mezzanine side has no letter of its own). Now a stair blob
   whose ink comes within `stairBridgeReachMeters` (2 m) of a second panel's
   free space attaches to both panels and bridges them with an ordinary edge
   (real distance, no letter). `stairAbutsPanel` in `stairs.ts` is the test;
   page margins are far wider than the reach, so cross-floor stairs never
   qualify, and near a seam nothing bridges. Triggers twice on Ale, six times
   on Kårhuset (all reviewed visually); a `stair-bridged` info diagnostic
   announces each one.

- **Three controls unattached (34/60/70).** All three were
   the same root cause: `attachControls` offered exactly one snap candidate —
   the globally nearest, possibly pulled onto a nearby existing node by
   `snapToExistingPx` — and vetoed the control when that single candidate's
   sight-line clipped a wall by 1–2 px over tolerance. The rooms were connected
   (panels are connected components; only the straight chord was blocked).
   `snapPointToGraph` now enumerates per-edge candidates nearest-first with an
   `accept` callback, falling back from a refused pulled node to the raw
   projection; panel selection uses the same sighted probe. Note the old
   "further than 10 m" warning was a lie — it printed for sight rejections too;
   `UnattachedControl.reason` now distinguishes no-graph / too-far / no-sight.

---

## What was learned the hard way

Recorded because these cost real time and will recur.

**When a metric does not respond to a change, suspect the metric.** This happened
three times. The fitting objective sat at 191 through every parameter — the
harness was scoring half a map. A wall-crossing count stayed at exactly 33
through two different fixes — the check was measuring the chord between
endpoints, ignoring the polyline, and counting stair edges that are *supposed* to
span the page. Each time the flat response was the signal, and each time the
first two guesses at a cause were wrong.

**Measure before changing.** The guess-first attempts had a poor hit rate; the
ones that started by rendering the actual pixels or dumping the actual offending
edges landed immediately. `--dump-mask` exists because of this.

**Symbol definitions beat colour names.** Twice a colour name suggested a role
that the symbols using it contradicted.

**A guard without a widened candidate set becomes a veto.** Line-of-sight
checking correctly rejected controls attaching across a wall, but the code only
ever offered one candidate panel, so those controls were dropped instead of being
tried against the next panel out. Adding the guard *lost* attachments until the
candidate set was opened up. The same failure then recurred one level down:
panels got multiple candidates, but *within* a panel only the single nearest
snap position was ever offered, and controls 34/60/70 were vetoed on chords
that missed the tolerance by 1–2 px. When a sight or validity guard rejects,
the question is always "what is the next candidate", never "give up".

**Do not trust a diagnostic message's stated cause.** "Further than 10 m from
the generated graph" was printed for controls 1.8 m from the graph — the
message hard-coded one of three failure reasons. All three of this batch were
sight rejections, not distance. The unattached report now carries the actual
reason; keep it honest.

**Encoding failure as a large penalty hides it.** Scoring a broken event as 1000
let one defect dominate an objective and flatten the entire search.

---

## Files

```
packages/core/src/map-graph-extraction/
  types.ts                        shared types, roles, parameters
  palette.ts                      CIELab classification + learned-table classification
  indoor-kartnorm.generated.ts    ink table, generated from the kartnorm .omap
  indoor-colour-lut.generated.ts  learned colour table, 32 KB
  morphology.ts                   distance transform, open/close, components
  free-space.ts                   role → mask, barrier re-stamping, panel split
  skeleton.ts                     Zhang–Suen thinning
  trace.ts                        skeleton → graph, node identity
  simplify.ts                     merge, prune, RDP, resample (clearance-aware)
  contour.ts                      panel outlines
  snap.ts                         attach a point by splitting an edge
  line-of-sight.ts                the wall-crossing invariant
  stairs.ts                       stair detection
  pair-stairs.ts                  glyph signatures and cross-floor matching
  attach-controls.ts              control attachment
  to-event.ts                     pixel → event coordinates, id allocation
  pipeline.ts                     orchestration and diagnostics
  map-graph-extraction.test.ts    44 tests

apps/mapgraph-cli/
  index.ts                        generate a graph from a raster
  fit.ts                          parameter fitting against the corpus
  lib/ppm.ts                      PPM reader
```

Not committed. Everything above is in the working tree.

---

## Things that would trip up the next person

- The CLI reads **PPM**, not PDF. A Node-side pdf.js adapter was never chosen;
  `pdftoppm` fills the gap. The browser path would use `pdfjs-dist`, already a
  dependency of `apps/web`.
- **Event coordinates are not document millimetres.** The ratio ranges from 0.50
  to 1.96 across the corpus. Metre-valued parameters are converted through the
  event transform, never through DPI.
- `mapData.pageCount` counts *map* pages, which is not the number of physical PDF
  pages — a two-page-wide document is often composited onto one sheet.
- Stair edges carry `ignoreLength` and legitimately cross the page. Any geometric
  check over edges must exempt them.
- The scale is a user-supplied parameter and comes from the event data. The "10 m"
  bar next to the control descriptions is the marked route to the finish, not a
  scale bar.
- The corpus (23 event PDFs + `manifest.json`) lives at
  `/vol1/1007/projects/orienteering/map-corpus/`. PPM rasters are regenerated
  from those with `pdftoppm -r 150`. Earlier copies sat only in a session
  scratchpad under `/tmp`, which does not survive a reboot.
