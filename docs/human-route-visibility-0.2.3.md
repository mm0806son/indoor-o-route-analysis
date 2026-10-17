# Human thinking route visibility and sidebar — 0.2.3

The complete route is now a playback-dependent layer. Same-floor checks, exploration, rejected meetings, and missing frames hide the final route while retaining the selected leg's start/target markers and straight course connection. Closure and a successfully solved same-floor route reveal it. Seeking backward hides it again. Candidate paths and committed thinking paths continue to come from the current frame's overlay.

`LabsDisplayedRoute` is shared across Labs instead of repeating its shape. Human playback derives `showPath` from the frame; other Labs keep the default route display. Keeping the original path reference preserves automatic centering on a newly selected leg without recentering on every playback step.

The sidebar has fixed selectors, playback controls and export buttons. Explanation, working memory and effort share the remaining scrollable area. Changing frames scrolls the active explanation into view, including after scrolling down to the summary. Statistics no longer take height away from the explanation viewport.

## Regression and browser acceptance

- Unit tests cover hidden/pre-frame states, completion, backward seeking, retained control labels/path reference and same-floor completion.
- Browser tests assert actual complete-route polylines are absent before closure and present at closure, while controls remain attached.
- Each active explanation must fit inside its scroll viewport and the browser viewport; checking DOM presence alone is insufficient. The details area must retain usable height and the playback/export controls stay on screen.
- Forward, backward, arrow-key and autoplay checks include intermediate frames, candidate selection and memory visibility. Scrolling down to the summary before stepping back is also exercised.
- Target sizes: 2160×1097 CSS pixels at scale 1, plus 1440×731 at device scale 1.5 (2160×1097 screenshot pixels), matching the supplied screenshot dimensions and covering its tighter apparent layout without assuming the original browser's zoom setting.

Version `0.2.3`, branch `test/0.2.3-human-route`, release ID `1017-human-route`. The review URL remains `http://100.65.222.38:18083/labs?version=1017-human-route`. Ports 18081 and 18082 are unchanged.

Run the default compact viewport check:

```sh
TEST_EVENT_FILE=/absolute/path/to/wangfujing-project.json \
  SCREENSHOT_FILE=/tmp/human-visibility.png \
  node deploy/versioned/verify-human-route.mjs
```

For the larger CSS viewport, set `VIEWPORT_WIDTH=2160 VIEWPORT_HEIGHT=1097 DEVICE_SCALE=1`. Private events and screenshots remain local.

## Acceptance results

- Web unit tests: 3 files / 17 tests passed, including seven route-visibility regressions and the existing memory-panel cases.
- Related core route/trace/frame/effort/overlay/export tests: 8 files / 90 tests passed. No core algorithms changed in this patch.
- Production compilation, TypeScript checks and static export passed.
- Temporary production container: both viewport configurations passed every frame's route-layer and explanation clipping checks, forward/backward stepping, arrow keys, summary scrolling followed by stepping back, and autoplay including the intermediate exploration frame.
- Real local configured Wangfujing MW21E 2 → 3: 177.06246326940612 m / Y / one stair unchanged; JSON export, ordinary Route Analysis, all release switches and preference persistence passed. Zero browser runtime errors in both runs.
- The three compact screenshots (2160×1097 output pixels) were visually inspected: no final route on the first frame, only the current candidate path during exploration, completed route at closure, active explanations visible in all frames.

The actual two original files from the initial report remain unavailable; acceptance uses the local configured Wangfujing project, without committing or hosting private event data.
