# Human thinking playback — 0.2.2

## Behavior

The search now records the actual chosen candidate index and whether that choice immediately connects the two search frontiers. Candidate ranking still describes proximity preference; it is not treated as proof of which candidate was selected. Explanation text and map highlighting consume the same recorded choice. Immediate connections are explicitly narrated, and the closing sentence does not claim that a backward exploration occurred when none did.

Exploration memory remains the state before the current choice: committed stair chains and pending alternatives. Final paths are stored in `HumanRouteFrame.finalPaths`, separately from `memory`, so closing the plan retains the map route and meeting marker without showing an exploration memory panel. The panel also rejects legacy closure frames carrying memory data.

This patch changes trace and presentation only; it preserves route selection and corridor direction constraints from 0.2.1. New trace fields are optional for compatibility with existing fixtures/exports, whose missing choice index defaults to the previous first-candidate convention.

## Regression coverage

- Actual RouteAnalyzer searches in both directions where the nearest candidate is `f` but `Y` immediately connects the route. Assert choice index, explanation, chosen overlay path, final route, closure drawing data, and JSON export agreement.
- Final frame contains drawing paths but no exploration memory.
- Short-term memory React component shows chains/pending alternatives only in exploration, including protection against legacy closure payloads.
- Browser regression checks every real Wangfujing MW21E 2 → 3 frame, including current explanation, memory visibility, selected stair badge and its corridor polyline; repeats checks when stepping backward, using arrow keys, and autoplaying.

## Trial

Version `0.2.2`, release ID `1017-human-route`, same review URL and port 18083. Existing release options `1017-stairs` and `0804b` remain available. Build using the versioned deployment procedure, tagging the new image `indoor-o-route-analysis:0.2.2-human-route`; validate it on a temporary port before replacing the review container. Port 18081/18082 services remain unchanged.

```sh
TEST_EVENT_FILE=/absolute/path/to/wangfujing-project.json \
  RELEASE_URL=http://100.65.222.38:18083 \
  SCREENSHOT_FILE=/tmp/human-playback.png \
  node deploy/versioned/verify-human-route.mjs
```

The browser check reads the local JSON export blob and does not send the private project to a server. Per-step screenshots remain local and are not included in the site.

## Acceptance results — 2026-10-17

- Core: 32 test files / 375 tests passed in the final serial run, including 90 human-route tests. A run overlapping the production build exceeded the existing 2-second route-enumeration threshold (2.145 seconds); the final run passed without relaxing it.
- Web: 2 files / 10 tests passed, including 7 memory-panel cases.
- Core typecheck and the production Next.js build/typecheck/static export passed.
- Temporary trial at port 18084: all three version choices and preference persistence passed; no browser runtime errors.
- Local configured Wangfujing project, MW21E 2 → 3 (32 → 52): distance remains 177.06246326940612 m, route label Y, plan depth 1. JSON explanation and choice index agree with the UI and selected overlay. Both candidate paths and the seam 1212 → 1211 are preserved.
- Each of the three frames passed on forward playback, and the applicable frames passed again after previous/next, keyboard navigation and autoplay. Screenshots of exploration and closure were visually checked.

Verified frame transcript:

1. `Same floor? No - we need to check the stairs.` No memory panel or selected candidate.
2. `From control 2 on floor 1, the reachable stairs are f, F, G, g, O, P, Q, q and Y. Stair Y connects the start-side and target-side paths, so choose Y.` Only Y is selected on the map; its corridor polyline exists. Memory shows the pre-choice empty chains and the pending target-side seed.
3. `The start and control are now connected. Route: Y. Go!` No memory panel or candidate badges; the final route and meeting marker remain visible.

The original two project files named in the initial bug report are not in this workspace; this acceptance uses the available local configured Wangfujing copy. No private project or screenshot is committed.
