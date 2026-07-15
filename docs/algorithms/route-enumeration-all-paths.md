# findAllAlternativePathsBetweenControls — Technical Reference

## Overview

`RouteAnalyzer.findAllAlternativePathsBetweenControls` exhaustively enumerates all physically distinct routes between two controls in an indoor orienteering venue. "Distinct" means routes differ in which labeled edges (stairs) they cross, not in which unlabeled corridors connect those stairs.

The function is used in "find all routes" mode for course overview and leg analysis. It guarantees that the returned routes are sorted by distance (shortest first) and that at most `maxResults` routes are returned.

```ts
findAllAlternativePathsBetweenControls(
  fromControlId: string,
  toControlId: string,
  maxResults: number = 1000,
  distanceCutoff?: { ratio?: number; absoluteMeters?: number },
): RouteInfo[]
```

---

## Key Concepts

### Labeled vs. unlabeled edges

The venue graph has two kinds of edges:

| Kind | Example | Behavior |
|------|---------|----------|
| **Labeled** | Stairs `"A"`, ramp `"B"` | Define the crossings that make routes distinct |
| **Unlabeled bidirectional** | Corridors, open areas | Connect points within the same flat region |
| **Unlabeled one-way** | One-way corridors | Directed connections; treated like labeled edges in the cluster graph |

### Why clusters?

Unlabeled bidirectional edges form equivalence classes — any two nodes reachable from each other via only such edges are always "the same floor region." There is no routing choice between them; it is always possible and always uses the cheapest path. Collapsing each region into a single cluster node dramatically shrinks the search space.

---

## Algorithm: Four Phases

### Phase 1 — Union-Find clustering

Every node starts as its own cluster (lazily, on first `find()`/`union()` —
see the shared
[`UnionFind`](../../packages/core/src/utils/union-find.ts) class, also used
by the human-route simulation's cluster graph). Then every **bidirectional
unlabeled** edge unions its two endpoints. One-way unlabeled edges are
excluded from this merge step (they impose directionality and become
explicit cluster-graph edges in Phase 2).

```
uf = new UnionFind()

for each edge where !label && !oneWay:
    uf.union(edge.from, edge.to)
```

Path-compressed `find()` makes subsequent lookups near O(1).

### Phase 2 — Build the cluster graph

Every **labeled** edge and every **one-way unlabeled** edge becomes a directed edge in the cluster graph:

- Forward direction: `find(edge.from) → find(edge.to)`, carrying `edge.label` and `edgeId`.
- Reverse direction (unless `oneWay`): added with `edge.reverseLabel || edge.label`.

Each cluster-graph edge stores four fields:

```ts
interface ClusterEdge {
  toCluster: string;   // cluster representative of the destination
  label: string;       // visible text for deduplication
  fromNode: string;    // concrete node on the source side (entry point)
  toNode: string;      // concrete node on the destination side (exit point)
  edgeId: string;      // key shared by both directions of a physical edge
}
```

The `edgeId` field enforces that each physical staircase can be used **at most once per route** in either direction, which prevents infinite loops through the same stair.

### Phase 3 — A* heuristic pre-computation

Before enumeration starts, a single Dijkstra run on the **reversed full graph** (all edges, labeled and unlabeled) from the target node computes the true shortest distance `h(node)` from every node to the target. This is an admissible A* heuristic — it never overestimates — so states are always popped in non-decreasing cost order.

```
h[target] = 0
h[node]   = shortest distance from node to target (over all edges)
```

### Phase 4 — Unlabeled-only Dijkstra cache (`findUnlabeled`)

Within a cluster, movement uses only unlabeled edges. A cached Dijkstra function `findUnlabeled(from, to)` finds the shortest unlabeled-only path between any two concrete nodes. Results are memoised; a miss costs O((V+E) log V) with a binary min-heap.

This is used in two contexts:
1. **Expansion**: navigate within a cluster to reach the entry point of the next stair.
2. **Completion / stitching**: assemble the concrete node sequence once a label sequence has been committed to.

---

## Best-First Enumeration

### State representation

```ts
interface SearchState {
  node: string;                           // current concrete node
  g: number;                              // exact stitched distance so far
  f: number;                              // g + h(node)
  usedEdgeIds: Set<string>;              // physical edges already crossed
  waypoints: Array<{ from; to }>;        // ordered labeled crossings so far
  completion: boolean;                   // true = this state goes directly to target
}
```

### Priority queue

A **binary min-heap** ordered by `f = g + h` ensures that the cheapest feasible state is always processed next. The same inline min-heap implementation is used for all three Dijkstra instances in this function (the heuristic pre-pass, `findUnlabeled`, and the main search).

### Expansion (`pushExpansions`)

For each non-completed state at node `N`:

1. **Completion branch**: try `findUnlabeled(N, target)`. If reachable, push a completion state with `f = g + unlabeled_distance`.
2. **Stair branches**: for each cluster edge `E` out of `find(N)` that has not been used yet:
   - Find the unlabeled path from `N` to `E.fromNode`.
   - Add the physical crossing distance for the stair edge itself.
   - Push a new state with the updated `g`, `f = g + h(E.toNode)`, and `E.edgeId` added to `usedEdgeIds`.

A depth guard (`MAX_LABEL_DEPTH = 25`) prevents pathological explosion when stair distances are zero.

### Completion and path stitching

When a **completion state** is popped, the concrete path is assembled by replaying each waypoint:

```
cursor = fromNode
for each waypoint (from, to):
    append findUnlabeled(cursor, from).path
    append 'to'   ← the labeled crossing
    cursor = to
append findUnlabeled(cursor, targetNode).path
```

### Deduplication

Routes are deduplicated by their **visible label sequence** — the concatenation of non-empty edge labels. Two routes that share the same stair sequence but use different one-way corridors to reach those stairs are treated as the same route; only the shorter one (the first pop) is kept.

```ts
const desc = getRouteLabels(fullPath).join(',');
if (seenDescriptions.has(desc)) continue;
```

### Safety limits

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_LABEL_DEPTH` | 25 | Maximum number of labeled edges per route |
| `MAX_POPS` | 500 000 | Hard cap on heap pops to bound CPU time |
| `maxResults` | caller-supplied (default 1000) | Cap on emitted routes; triggers a `console.warn` if hit with queue non-empty |

### Distance cutoff

An optional `distanceCutoff` parameter prunes states whose accumulated cost exceeds:

```
cutoff = max(ratio * h(fromNode), h(fromNode) + absoluteMeters)
```

States above the cutoff are never pushed. This is applied both at completion time and during stair expansion.

---

## Output

The function returns `RouteInfo[]` sorted by `distance` ascending. Each entry includes the full concrete node path, distance in meters, difficulty metrics, stair labels, and polygon context — all computed by `buildRouteInfo`.

If `maxResults` is reached while the heap still has entries, a warning is logged and the omitted routes are longer than all returned routes (because the heap is ordered by `f = g + h`).

---

## Complexity

| Concern | Bound |
|---------|-------|
| Heuristic pre-pass | O((V+E) log V) once |
| `findUnlabeled` | O((V+E) log V) per distinct (from, to) pair; cached |
| Main enumeration | O(R · S · log Q) where R = distinct routes, S = avg stairs per route, Q = queue size |

In practice the cluster graph is small (typically < 20 stair edges for a multi-floor venue), so R stays tractable for real courses.

---

## Related

- [Route enumeration design spec](superpowers/specs/2026-06-18-route-enumeration-best-first-design.md)
- `findAlternativePathsBetweenControls` — the heuristic k-best alternative (penalty-Dijkstra, not exhaustive)
- `RouteInfo` — output type defined at the top of [route-analyzer.ts](../packages/core/src/route-analyzer.ts)
- `route-viz-cli` — renders a video visualization of this algorithm's search process (shortest/easiest/all-routes phases), driven by the `RouteAnalyzerVisualizer` hooks in [route-analyzer.ts](../packages/core/src/route-analyzer.ts)
