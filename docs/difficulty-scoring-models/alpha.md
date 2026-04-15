# Alpha Scoring Model

Version: 0.1  
ID: `alpha`  
Name: `Alpha`

## Overview

The Alpha model is a simple additive indoor-orienteering difficulty model.
It measures route difficulty from three factors:

- stairs climbed (up)
- stairs descended (down)
- branching points

The model is intentionally lightweight and easy to reason about. It does not
attempt to estimate time loss, visibility, or decision complexity beyond
counting branching opportunities.

## Formula

Raw difficulty:

$$
D_{raw} = 5 \cdot U + 5 \cdot D + 3 \cdot B
$$

Where:

- $U$ = number of upstairs transitions
- $D$ = number of downstairs transitions
- $B$ = number of branching points

Scaled difficulty used by the implementation:

$$
D = D_{raw} \cdot s, \quad s = \frac{100}{102}
$$

## Feature Definitions

### 1) Stairs (up/down)

For each consecutive pair of route points in the path:

1. Find the traversed edge.
2. Only consider the edge if it is a level-change edge.
3. Determine floor levels from polygons at each endpoint position.
4. If destination level is higher, count as `up`; otherwise count as `down`.

Notes:

- If no polygons are available, stair counts are zero.
- If endpoint positions cannot be resolved, the step is skipped.
- Equal levels are treated as `down` by current implementation behavior.

### 2) Branching Points

A branching point is counted at a route node when:

- total connected edges at the node > expected route-path edges at that node

Expected route-path edges:

- first route node: 1 (outgoing)
- intermediate route node: 2 (incoming + outgoing)

Implementation behavior details:

- The loop checks route indices `0..path.length-2`, so the final path node is
	not evaluated as a branching point.
- Edge direction and one-way accessibility are ignored for branching count; raw
	incidence count is used.

## Difficulty Categories

The model maps to Stockholm Indoor Cup style bands:

- White: D0-D20
- Yellow: D20-D40
- Orange: D40-D60
- Purple: D60-D80
- Black: D80+

## Calibration Reference

The implementation includes this reference route for scaling context:

- Stockholm Indoor Cup 2023 Etapp 1, Bana 1, leg 15 -> 16

## Scope and Limitations

Included:

- Vertical transitions (stairs / level changes)
- Local choice complexity via branching incidence

Not included:

- Corridor length, pace, or physical distance
- Visibility / line-of-sight complexity
- Turn-angle penalties
- One-way traversal legality in branching complexity
- Dynamic crowding or race context

Additional limitations:

- Results depend strongly on how the navigation graph is drawn. A denser or more
	granular graph can increase counted branching opportunities even when the
	underlying navigational situation is effectively the same.
- Branching-point count is intentionally very simplified. It only measures that
	extra connections exist at a route node, not how difficult those alternatives
	are to interpret, distinguish, or reject.
- The model is additive, but real navigational difficulty may be partly
	multiplicative. Several sequential branching decisions can compound into a
	much larger choice space than a simple sum suggests.

## Implementation Source

Canonical implementation lives in:

- `packages/core/src/scoring-models/alpha-model.ts`
