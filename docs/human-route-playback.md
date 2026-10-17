# Human route playback

The explanation and map use the actual candidate selected by the search. A stair that immediately connects the two search frontiers can be selected ahead of the nearest candidate. The exploration frame identifies that choice explicitly.

Working memory is shown only during exploration. Completed drawing paths are stored separately from memory. The final route is revealed when the plan closes and hidden again when stepping backward; the leg's controls remain visible throughout. A direct same-floor solution is shown immediately.

The explanation, working memory and effort summary share a scrollable region, leaving playback and export controls available. Stepping forward or backward brings the active explanation into view, including after scrolling to the summary. Use Left/Right to step and Space to play or pause.

Core and web Vitest regressions run with `pnpm test:run`. The Playwright suite (`pnpm test:e2e`) imports a small synthetic event from `apps/web/e2e/fixtures/human-playback.json` and checks candidate selection, memory, route visibility, explanation clipping, forward/backward navigation, keyboard controls, autoplay and pause at 1440 × 731 and 2160 × 1097 CSS pixels. The fixture embeds a blank single-page PDF so the real map renderer is exercised. It needs no private event file or deployed service.
