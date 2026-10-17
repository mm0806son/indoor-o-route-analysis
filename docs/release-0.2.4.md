# Release 0.2.4

This release merges the accepted human-route fixes: directed corridor reachability, consistent chosen-candidate narration and highlighting, exploration-only working memory, final-route visibility tied to playback, and a sidebar that keeps the active explanation readable.

The unaccepted Stairs view and its floor-order controls, data model additions, exports and editor integrations are excluded. The only prerequisite retained from the earlier trial baseline is the HTTP UUID compatibility fix needed for local browser imports, with its regression test.

The version picker is retained in English, including its accessible name and reload tooltip. It offers `0.2.4` and the prior stable `0804b`; unaccepted stair trial images are not dependencies or selectable releases. No event data is transmitted, and selection is only a local preference cookie.

## Build and deployment

Build this source tree with `NEXT_TELEMETRY_DISABLED=1 pnpm --filter web exec next build --webpack`. Prepare a directory containing the files from `deploy/versioned/` and the exported `apps/web/out/` as `site/`. Build it with:

```sh
docker build -t indoor-o-route-analysis:0.2.4 /path/to/build-context
```

The Dockerfile uses the existing stable `indoor-o-route-analysis:0804b` image and includes the two static releases and shared hashed assets. Run on the chosen local address/port:

```sh
docker run -d --name indoor-o-route-analysis-024 --restart unless-stopped \
  -p 100.65.222.38:18083:8080 indoor-o-route-analysis:0.2.4
```

The release link is `http://100.65.222.38:18083/labs?version=0.2.4`. Static version metadata is at `/version.json`, and `/__releases/current` reports the selected release. Do not use the historical stair snapshot build procedure for this release.

## Verification

Run web/core tests, the production build, and the browser acceptance script against the packaged release:

```sh
TEST_EVENT_FILE=/absolute/path/to/wangfujing-project.json \
  RELEASE_URL=http://100.65.222.38:18083 \
  node deploy/versioned/verify-human-route.mjs
```

Browser checks cover each real MW21E 2 → 3 frame, forward/backward/keyboard/autoplay, clipping and route visibility, JSON export, ordinary Route Analysis, both version choices and local preference persistence. They also assert the Stairs navigation is absent and the application's initial UI and version picker contain no Chinese text. Imported event names are user data and are not translated.

Earlier `human-route-*` documents describe historical acceptance builds, some containing the subsequently rejected Stairs baseline. This document describes the merged release.

## Release verification results

On 2026-10-18, the clean release passed 15 web tests (including the HTTP UUID regression), 90 related core tests, core typechecking, and the production build/typecheck/static export. Browser acceptance against the packaged image passed the real configured Wangfujing MW21E 2 → 3 sequence, both release choices, English initial UI and preference persistence with zero runtime errors. The image has neither a Stairs page nor a `1017-stairs` release directory. Source comparison against the previous main confirms no changes to stair-related models, editors, routes or navigation.

## Production deployment (2026-10-18)

Production runs image `indoor-o-route-analysis:0.2.4` in container `indoor-o-route-analysis`, bound to `100.65.222.38:18081`, with restart policy `unless-stopped`. Open `http://100.65.222.38:18081/labs?version=0.2.4`. The English version picker retains `0804b`; direct browser rollback is available at `http://100.65.222.38:18081/labs?version=0804b`.

Only two route-analysis environments remain running: production on 18081 and the existing development environment on 18082. The separate instances on 18080 and 18083 are stopped with automatic restart disabled. The unaccepted Stairs feature remains confined to development.

The previous production container is preserved, stopped, as `indoor-o-route-analysis-0804b-backup-20261018`, with automatic restart disabled. For a full service rollback, stop and preserve the current container, then restore the backup:

```sh
docker stop indoor-o-route-analysis
docker rename indoor-o-route-analysis indoor-o-route-analysis-024-rollback-backup
docker update --restart=no indoor-o-route-analysis-024-rollback-backup
docker rename indoor-o-route-analysis-0804b-backup-20261018 indoor-o-route-analysis
docker update --restart=unless-stopped indoor-o-route-analysis
docker start indoor-o-route-analysis
```

Production browser acceptance passed at 1440 × 731 CSS pixels with device scale 1.5 (2160 × 1097 screenshot) and at 2160 × 1097 CSS pixels with device scale 1. Both runs covered every real Wangfujing MW21E 2 → 3 playback frame, forward/backward/keyboard/autoplay, explanation visibility, final-route visibility, export, ordinary Route Analysis, release switching and preference persistence, with zero browser runtime errors.
